import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { ZnsDispatcherService } from '../src/services';
import { isWithinHours, pauseReason } from '../src/services/branch-hours';
import { historyResult, maskPhone, resolveRange, validateSettingsPatch } from '../src/routes/manage';
import { addTickets, applySchema, resetWorld, vnToday, W } from './helpers/world';

const D = '\u00B7';
const N = (p: string, n: number) => `${p}${D}${String(n).padStart(3, '0')}`;
const MANAGER = { 'X-Dev-Actor': 'BRANCH_MANAGER', 'X-Dev-Branch-Id': W.branch, 'Content-Type': 'application/json' };
const OTHER_MANAGER = { 'X-Dev-Actor': 'BRANCH_MANAGER', 'X-Dev-Branch-Id': W.branch2 };

const api = (path: string, init: RequestInit = {}) =>
  SELF.fetch(`http://x/api/manage/${W.branch}${path}`, { ...init, headers: { ...MANAGER, ...(init.headers ?? {}) } });

beforeAll(async () => {
  await applySchema(env.DB, env.TEST_SCHEMA_SQL);
});
beforeEach(async () => {
  await resetWorld(env.DB);
});

describe('manage · access', () => {
  it('requires staff and the right branch', async () => {
    expect((await SELF.fetch(`http://x/api/manage/${W.branch}/settings`)).status).toBe(401);
    expect((await SELF.fetch(`http://x/api/manage/${W.branch}/settings`, { headers: OTHER_MANAGER })).status).toBe(403);
    expect((await SELF.fetch(`http://x/api/manage/${W.branch}/history`, { headers: OTHER_MANAGER })).status).toBe(403);
    expect((await api('/settings')).status).toBe(200);
    expect((await SELF.fetch('http://x/api/manage/nope/settings', { headers: MANAGER })).status).toBe(404);
  });
});

describe('manage · settings (M8)', () => {
  it('reads defaults and saves hold time + ZNS threshold + TV toggles', async () => {
    const before = (await (await api('/settings')).json()) as Record<string, unknown>;
    expect(before).toMatchObject({ graceMins: 10, znsAlmostThreshold: 2, tvTts: true, walletBalanceVnd: 50_000 });
    const res = await api('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ graceMins: 15, znsAlmostThreshold: 3, tvMascot: false, openTime: '10:00', closeTime: '21:30', autoPauseWaitMins: 45 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ graceMins: 15, znsAlmostThreshold: 3, tvMascot: false, openTime: '10:00', closeTime: '21:30', autoPauseWaitMins: 45 });
    const tv = (await (await SELF.fetch(`http://x/api/branches/${W.branch}/tv`)).json()) as { tv: { mascot: boolean } };
    expect(tv.tv.mascot).toBe(false);
  });

  it('rejects out-of-range values with Vietnamese field hints and saves nothing', async () => {
    const res = await api('/settings', { method: 'PATCH', body: JSON.stringify({ graceMins: 45, znsAlmostThreshold: 2 }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: Record<string, string> };
    expect(body.code).toBe('INVALID_SETTINGS');
    expect(body.fields.graceMins).toBe('Từ 3 đến 30 phút');
    expect(((await (await api('/settings')).json()) as { graceMins: number }).graceMins).toBe(10);
  });

  it('validates pure patches', () => {
    expect(validateSettingsPatch({ znsAlmostThreshold: 0 }).errors.znsAlmostThreshold).toBe('Từ 1 đến 5 nhóm');
    expect(validateSettingsPatch({ openTime: '25:00', closeTime: '10:00' }).errors.openTime).toBeDefined();
    expect(validateSettingsPatch({ autoPauseWaitMins: null }).sets).toEqual([['auto_pause_wait_mins', null]]);
    expect(validateSettingsPatch({ tvVoice: 'robot' }).errors.tvVoice).toBeDefined();
  });

  it('ZNS "almost" threshold follows the saved setting', async () => {
    await addTickets(env.DB, [
      { id: 'seat', num: N('A', 1), status: 'SEATED' },
      ...[2, 3, 4, 5].map((i) => ({ id: `w${i}`, num: N('A', i) })),
    ]);
    const svc = new ZnsDispatcherService(env.DB);
    expect((await svc.onTicketSeated('seat')).notifiedTicketId).toBe('w4'); // default: 2 ahead
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ znsAlmostThreshold: 3 }) });
    await env.DB.prepare('DELETE FROM wallet_ledger').run();
    expect((await svc.onTicketSeated('seat')).notifiedTicketId).toBe('w5'); // 3 ahead
  });
});

describe('manage · effective pause', () => {
  it('pure helpers: hours (incl. overnight) and wait limit', () => {
    const at = (h: number, m = 0) => Date.UTC(2026, 9, 15, h - 7, m);
    expect(isWithinHours('10:00', '21:30', at(12))).toBe(true);
    expect(isWithinHours('10:00', '21:30', at(22))).toBe(false);
    expect(isWithinHours('18:00', '02:00', at(23))).toBe(true);
    expect(isWithinHours('18:00', '02:00', at(12))).toBe(false);
    expect(pauseReason({ is_paused: 0, auto_pause_wait_mins: 45 }, at(12), 50)).toBe('WAIT_TOO_LONG');
    expect(pauseReason({ is_paused: 1 }, at(12))).toBe('MANUAL');
    expect(pauseReason({ is_paused: 0, open_time: '10:00', close_time: '11:00' }, at(12))).toBe('OUTSIDE_HOURS');
  });

  it('outside opening hours: tickets are refused and the TV / check-in show paused', async () => {
    const h = new Date(Date.now() + 7 * 3600_000).getUTCHours();
    const open = `${String((h + 2) % 24).padStart(2, '0')}:00`;
    const close = `${String((h + 3) % 24).padStart(2, '0')}:00`;
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ openTime: open, closeTime: close }) });
    const res = await SELF.fetch('http://x/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: W.branch, paxCount: 2, customerName: 'Lan', source: 'QR_ONSITE' }),
    });
    expect(res.status).toBe(423);
    expect(((await res.json()) as { code: string }).code).toBe('QUEUE_PAUSED');
    const qr = (await (await SELF.fetch('http://x/api/branches/by-qr/qr-w1')).json()) as { isPaused: boolean; pauseReason: string };
    expect(qr).toMatchObject({ isPaused: true, pauseReason: 'OUTSIDE_HOURS' });
  });

  it('remote queue off refuses MARKETPLACE tickets only', async () => {
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ allowRemoteQueue: false }) });
    const post = (source: string) =>
      SELF.fetch('http://x/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: W.branch, paxCount: 2, customerName: 'Lan', source }),
      });
    const remote = await post('MARKETPLACE');
    expect(remote.status).toBe(423);
    expect(((await remote.json()) as { code: string }).code).toBe('REMOTE_QUEUE_DISABLED');
    expect((await post('QR_ONSITE')).ok).toBe(true);
  });
});

describe('manage · history (M5)', () => {
  beforeEach(async () => {
    const t = Date.now() - 3600_000;
    await addTickets(env.DB, [
      { id: 'h1', num: N('A', 1), status: 'SEATED', name: 'Nguyễn Thị Lan', phoneMasked: '0901234321', createdAt: t, calledAt: t + 25 * 60_000, seatedAt: t + 27 * 60_000 },
      { id: 'h2', num: N('A', 2), status: 'CANCELLED', createdAt: t + 60_000, calledAt: t + 20 * 60_000, cancelledAt: t + 31 * 60_000 },
      { id: 'h3', num: N('B', 1), bucket: W.bucketB, status: 'CANCELLED', source: 'HOST_MANUAL', createdAt: t + 120_000, cancelledAt: t + 5 * 60_000 },
      { id: 'h4', num: N('A', 3), status: 'HELD', createdAt: t + 180_000, calledAt: t + 30 * 60_000, heldAt: t + 41 * 60_000 },
      { id: 'old', num: N('A', 9), status: 'SEATED', date: '2020-01-01' },
    ]);
    await env.DB.prepare(
      `INSERT INTO wallet_ledger (id, merchant_id, ticket_id, amount_vnd, tx_type, reference_code, created_at)
       VALUES ('l1', ?1, 'h1', -400, 'ZNS_CALL_ALERT', 'zns_approaching_h1', ?2)`,
    ).bind(W.merchant, t + 18 * 60_000).run();
  });

  type H = {
    date: string;
    counts: { all: number; seated: number; noShow: number; cancelled: number };
    stats: { issued: number; served: number; avgWaitMins: number; noShowPct: number };
    rows: { id: string; result: string; phoneMasked: string | null; source: string; waitedMins: number; zns: { amountVnd: number } | null; canRestore: boolean; canRecall: boolean }[];
  };

  it('lists today with results, masked phone, ZNS ledger join and stats', async () => {
    const h = (await (await api('/history')).json()) as H;
    expect(h.date).toBe(vnToday());
    expect(h.counts).toEqual({ all: 4, seated: 1, noShow: 1, cancelled: 1 });
    const lan = h.rows.find((r) => r.id === 'h1')!;
    expect(lan).toMatchObject({ result: 'SEATED', phoneMasked: '090****321', waitedMins: 25, zns: { amountVnd: 400 } });
    expect(h.rows.find((r) => r.id === 'h2')).toMatchObject({ result: 'NO_SHOW', canRestore: true });
    expect(h.rows.find((r) => r.id === 'h3')).toMatchObject({ result: 'CANCELLED', source: 'COUNTER' });
    expect(h.rows.find((r) => r.id === 'h4')).toMatchObject({ result: 'ACTIVE', canRecall: true });
    expect(h.stats).toMatchObject({ issued: 4, served: 1, noShowPct: 25 });
    expect(h.rows.some((r) => r.id === 'old')).toBe(false);
  });

  it('filters by result, bucket and search; other dates by ?date=', async () => {
    expect(((await (await api('/history?result=noshow')).json()) as H).rows.map((r) => r.id)).toEqual(['h2']);
    expect(((await (await api('/history?bucket=B')).json()) as H).rows.map((r) => r.id)).toEqual(['h3']);
    expect(((await (await api('/history?q=lan')).json()) as H).rows.map((r) => r.id)).toEqual(['h1']);
    expect(((await (await api('/history?q=321')).json()) as H).rows.map((r) => r.id)).toEqual(['h1']);
    expect(((await (await api('/history?date=2020-01-01')).json()) as H).rows.map((r) => r.id)).toEqual(['old']);
  });

  it('exports CSV (UTF-8 BOM, masked phone, Vietnamese result labels)', async () => {
    const res = await api('/history?format=csv');
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Nguyễn Thị Lan,090****321');
    expect(text).toContain('Bỏ về');
    expect(text).not.toContain('0901234321');
  });

  it('restores a ticket cancelled today back to WAITING; refuses others', async () => {
    const ok = await api('/tickets/h2/restore', { method: 'POST' });
    expect(ok.status).toBe(200);
    const row = await env.DB.prepare(`SELECT status, called_at FROM tickets WHERE id = 'h2'`).first<{ status: string; called_at: number | null }>();
    expect(row).toEqual({ status: 'WAITING', called_at: null });
    expect((await api('/tickets/h1/restore', { method: 'POST' })).status).toBe(409);
    expect((await api('/tickets/old/restore', { method: 'POST' })).status).toBe(409);
  });

  it('restore refuses when the guest already holds another active ticket', async () => {
    await env.DB.prepare(`UPDATE tickets SET zalo_user_id = 'z1' WHERE id IN ('h2', 'h4')`).run();
    const res = await api('/tickets/h2/restore', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('ACTIVE_TICKET_EXISTS');
  });

  it('pure helpers', () => {
    expect(historyResult({ status: 'CANCELLED', called_at: 1 })).toBe('NO_SHOW');
    expect(historyResult({ status: 'CANCELLED', called_at: null })).toBe('CANCELLED');
    expect(maskPhone('+84 901 234 321')).toBe('849****321');
    expect(maskPhone(null)).toBeNull();
  });
});

describe('manage · reports (M6)', () => {
  it('KPIs, by-hour, per-bucket, source split and range validation', async () => {
    const t = Date.now() - 2 * 3600_000;
    await addTickets(env.DB, [
      { id: 'r1', num: N('A', 1), status: 'SEATED', createdAt: t, calledAt: t + 10 * 60_000 },
      { id: 'r2', num: N('A', 2), status: 'SEATED', createdAt: t, calledAt: t + 20 * 60_000, source: 'HOST_MANUAL' },
      { id: 'r3', num: N('B', 1), bucket: W.bucketB, status: 'CANCELLED', createdAt: t },
      { id: 'r4', num: N('A', 3), status: 'WAITING', createdAt: t },
    ]);
    const r = (await (await api('/reports?range=today')).json()) as {
      range: { key: string; days: number };
      kpis: { served: number; avgWaitMins: number; lostPct: number; issued: number };
      byHour: { hour: number; avgPerDay: number }[];
      buckets: { prefix: string; served: number; avgWaitMins: number; noShowPct: number }[];
      source: { zaloPct: number; counterPct: number };
    };
    expect(r.range).toMatchObject({ key: 'today', days: 1 });
    expect(r.kpis).toMatchObject({ issued: 4, served: 2, avgWaitMins: 15, lostPct: 25 });
    expect(r.byHour.reduce((a, h) => a + h.avgPerDay, 0)).toBe(4);
    expect(r.buckets.find((b) => b.prefix === 'A')).toMatchObject({ served: 2, avgWaitMins: 15, noShowPct: 0 });
    expect(r.buckets.find((b) => b.prefix === 'B')).toMatchObject({ noShowPct: 100 });
    expect(r.source).toEqual({ zaloPct: 75, counterPct: 25 });
    expect((await api('/reports?range=custom&from=2026-10-10&to=2026-10-01')).status).toBe(400);
  });

  it('resolves ranges with an equal previous period', () => {
    const now = Date.UTC(2026, 9, 15, 5);
    expect(resolveRange({ range: '7d' }, now)).toMatchObject({ from: '2026-10-09', to: '2026-10-15', days: 7, prevFrom: '2026-10-02', prevTo: '2026-10-08' });
    expect(resolveRange({ range: 'custom', from: '2026-01-01', to: '2026-12-31' }, now)).toBeNull();
  });
});

describe('manage · QR (M7)', () => {
  it('returns the walk-in link + TV slug and regenerates the token', async () => {
    const q = (await (await api('/qr')).json()) as { qrToken: string; tvSlug: string; tvConnected: number };
    expect(q).toMatchObject({ qrToken: 'qr-w1', tvSlug: 'pho-w-nh', tvConnected: 0 });
    const res = (await (await api('/qr/regenerate', { method: 'POST' })).json()) as { qrToken: string };
    expect(res.qrToken).toMatch(/^qr-w1-r[0-9a-f]{6}$/);
    expect((await SELF.fetch('http://x/api/branches/by-qr/qr-w1')).status).toBe(404);
    expect((await SELF.fetch(`http://x/api/branches/by-qr/${res.qrToken}`)).status).toBe(200);
  });
});
