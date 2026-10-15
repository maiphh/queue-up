import { Hono, type Context } from 'hono';
import type { Env } from '../index';
import { assertBranchAccess, isValidHhmm, resolveActor } from '../services';

/**
 * Round 4 · Manager sub-pages (`/manage/:branchId/{history,reports,qr,settings}`).
 * Every route is staff-only and branch-scoped (BRANCH_MANAGER of the branch,
 * CLIENT_ADMIN of its client, or PLATFORM_ADMIN).
 */
const manage = new Hono<{ Bindings: Env }>();
type C = Context<{ Bindings: Env }>;

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3600_000;

function apiError(error: string, code: string) {
  return { error, code };
}

async function gate(c: C): Promise<Response | null> {
  const actor = await resolveActor(c.req.raw.headers, c.env);
  if (!actor.ok) return c.json(apiError('Staff authentication required', actor.code), 401);
  const branchId = c.req.param('branchId')!;
  const exists = await c.env.DB.prepare(`SELECT id FROM branches WHERE id = ?1`).bind(branchId).first();
  if (!exists) return c.json(apiError('Branch not found', 'BRANCH_NOT_FOUND'), 404);
  const access = await assertBranchAccess(c.env.DB, actor.actor, branchId);
  if (access !== true) return c.json(apiError('Insufficient staff role', access.code), access.status);
  return null;
}

/** YYYY-MM-DD in Vietnam. */
export function vnDate(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}
function isDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function hhmm(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(11, 16);
}

// ───────────────────────── Settings (M8) ─────────────────────────

type SettingsRow = {
  allow_remote_queue: number;
  open_time: string | null;
  close_time: string | null;
  auto_pause_wait_mins: number | null;
  grace_period_mins: number;
  shortcuts_enabled: number;
  zns_almost_threshold: number;
  zns_call_enabled: number;
  tv_tts: number;
  tv_voice: string;
  tv_chime: number;
  tv_mascot: number;
  tv_static: number;
  wallet_balance_vnd: number;
  merchant_name: string;
};

export const SETTINGS_LIMITS = {
  graceMins: [3, 30],
  znsAlmostThreshold: [1, 5],
  autoPauseWaitMins: [15, 180],
} as const;
export const TV_VOICES = ['female-south', 'male-south', 'female-north', 'male-north'] as const;

function settingsOut(r: SettingsRow) {
  return {
    allowRemoteQueue: r.allow_remote_queue === 1,
    openTime: r.open_time,
    closeTime: r.close_time,
    autoPauseWaitMins: r.auto_pause_wait_mins,
    graceMins: r.grace_period_mins,
    shortcutsEnabled: r.shortcuts_enabled === 1,
    znsAlmostThreshold: r.zns_almost_threshold,
    znsCallEnabled: r.zns_call_enabled === 1,
    tvTts: r.tv_tts === 1,
    tvVoice: r.tv_voice,
    tvChime: r.tv_chime === 1,
    tvMascot: r.tv_mascot === 1,
    tvStatic: r.tv_static === 1,
    walletBalanceVnd: r.wallet_balance_vnd,
    merchantName: r.merchant_name,
  };
}

async function loadSettings(db: D1Database, branchId: string) {
  const row = await db
    .prepare(
      `SELECT b.allow_remote_queue, b.open_time, b.close_time, b.auto_pause_wait_mins, b.grace_period_mins,
              b.shortcuts_enabled, b.zns_almost_threshold, b.zns_call_enabled, b.tv_tts, b.tv_voice,
              b.tv_chime, b.tv_mascot, b.tv_static, m.wallet_balance_vnd, m.name AS merchant_name
       FROM branches b JOIN merchants m ON m.id = b.merchant_id WHERE b.id = ?1`,
    )
    .bind(branchId)
    .first<SettingsRow>();
  return row ? settingsOut(row) : null;
}

manage.get('/:branchId/settings', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  return c.json(await loadSettings(c.env.DB, c.req.param('branchId')));
});

type FieldErrors = Record<string, string>;

/** Validate a partial settings patch → SQL assignments, or field errors (Vietnamese hints). */
export function validateSettingsPatch(body: Record<string, unknown>): { sets: [string, unknown][]; errors: FieldErrors } {
  const sets: [string, unknown][] = [];
  const errors: FieldErrors = {};
  const intIn = (key: string, col: string, [lo, hi]: readonly [number, number], hint: string, nullable = false) => {
    if (!(key in body)) return;
    const v = body[key];
    if (nullable && v === null) return void sets.push([col, null]);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) errors[key] = hint;
    else sets.push([col, v]);
  };
  const bool = (key: string, col: string) => {
    if (!(key in body)) return;
    if (typeof body[key] !== 'boolean') errors[key] = 'Giá trị không hợp lệ';
    else sets.push([col, body[key] ? 1 : 0]);
  };
  intIn('graceMins', 'grace_period_mins', SETTINGS_LIMITS.graceMins, 'Từ 3 đến 30 phút');
  intIn('znsAlmostThreshold', 'zns_almost_threshold', SETTINGS_LIMITS.znsAlmostThreshold, 'Từ 1 đến 5 nhóm');
  intIn('autoPauseWaitMins', 'auto_pause_wait_mins', SETTINGS_LIMITS.autoPauseWaitMins, 'Từ 15 đến 180 phút', true);
  bool('allowRemoteQueue', 'allow_remote_queue');
  bool('shortcutsEnabled', 'shortcuts_enabled');
  bool('znsCallEnabled', 'zns_call_enabled');
  bool('tvTts', 'tv_tts');
  bool('tvChime', 'tv_chime');
  bool('tvMascot', 'tv_mascot');
  bool('tvStatic', 'tv_static');
  if ('tvVoice' in body) {
    if (!TV_VOICES.includes(body.tvVoice as (typeof TV_VOICES)[number])) errors.tvVoice = 'Giọng không hợp lệ';
    else sets.push(['tv_voice', body.tvVoice]);
  }
  if ('openTime' in body || 'closeTime' in body) {
    const o = body.openTime ?? null;
    const cl = body.closeTime ?? null;
    if (o === null && cl === null) {
      sets.push(['open_time', null], ['close_time', null]);
    } else if (!isValidHhmm(o) || !isValidHhmm(cl)) {
      errors.openTime = 'Nhập giờ dạng 10:00';
    } else if (o === cl) {
      errors.openTime = 'Giờ mở và giờ đóng phải khác nhau';
    } else {
      sets.push(['open_time', o], ['close_time', cl]);
    }
  }
  return { sets, errors };
}

manage.patch('/:branchId/settings', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
  } catch {
    return c.json(apiError('Invalid JSON', 'INVALID_BODY'), 400);
  }
  const { sets, errors } = validateSettingsPatch(body);
  if (Object.keys(errors).length > 0) {
    return c.json({ ...apiError('Invalid settings', 'INVALID_SETTINGS'), fields: errors }, 400);
  }
  const branchId = c.req.param('branchId');
  if (sets.length > 0) {
    const assign = sets.map(([col], i) => `${col} = ?${i + 1}`).join(', ');
    await c.env.DB.prepare(`UPDATE branches SET ${assign} WHERE id = ?${sets.length + 1}`)
      .bind(...sets.map(([, v]) => v), branchId)
      .run();
  }
  return c.json(await loadSettings(c.env.DB, branchId));
});

// ───────────────────────── History (M5) ─────────────────────────

type HistRow = {
  id: string;
  display_number: string;
  customer_name: string;
  customer_phone_masked: string | null;
  pax_count: number;
  source: string;
  status: string;
  created_at: number;
  called_at: number | null;
  held_at: number | null;
  seated_at: number | null;
  cancelled_at: number | null;
  prefix: string;
  label_vi: string;
  zns_at: number | null;
  zns_amount: number | null;
};

export type HistResult = 'SEATED' | 'NO_SHOW' | 'CANCELLED' | 'ACTIVE';

/** Bỏ về = cancelled after being called (no-show); Đã hủy = cancelled before any call. */
export function historyResult(r: { status: string; called_at: number | null }): HistResult {
  if (r.status === 'SEATED') return 'SEATED';
  if (r.status === 'CANCELLED') return r.called_at != null ? 'NO_SHOW' : 'CANCELLED';
  return 'ACTIVE';
}

/** 0901234321 / 090****321 → always 090****321. */
export function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  if (d.length < 7) return p.includes('*') ? p : null;
  return `${d.slice(0, 3)}****${d.slice(-3)}`;
}

function waitedMins(r: HistRow, nowMs: number): number {
  const end = r.called_at ?? r.seated_at ?? r.cancelled_at ?? nowMs;
  return Math.max(0, Math.round((end - r.created_at) / 60_000));
}

async function historyRows(db: D1Database, branchId: string, date: string): Promise<HistRow[]> {
  const res = await db
    .prepare(
      `SELECT t.id, t.display_number, t.customer_name, t.customer_phone_masked, t.pax_count, t.source, t.status,
              t.created_at, t.called_at, t.held_at, t.seated_at, t.cancelled_at, q.prefix, q.label_vi,
              (SELECT MIN(l.created_at) FROM wallet_ledger l WHERE l.ticket_id = t.id AND l.tx_type = 'ZNS_CALL_ALERT') AS zns_at,
              (SELECT SUM(l.amount_vnd) FROM wallet_ledger l WHERE l.ticket_id = t.id AND l.tx_type = 'ZNS_CALL_ALERT') AS zns_amount
       FROM tickets t JOIN queue_buckets q ON q.id = t.bucket_id
       WHERE t.branch_id = ?1 AND t.ticket_date = ?2
       ORDER BY t.created_at DESC`,
    )
    .bind(branchId, date)
    .all<HistRow>();
  return res.results ?? [];
}

manage.get('/:branchId/history', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  const now = Date.now();
  const q = c.req.query();
  const date = isDate(q.date) ? q.date : vnDate(now);
  const all = await historyRows(c.env.DB, c.req.param('branchId'), date);

  const needle = (q.q ?? '').trim().toLocaleLowerCase('vi');
  const digits = needle.replace(/\D/g, '');
  const scoped = all.filter((r) => {
    if (q.bucket && r.prefix !== q.bucket) return false;
    if (!needle) return true;
    return (
      r.customer_name.toLocaleLowerCase('vi').includes(needle) ||
      r.display_number.toLocaleLowerCase('vi').replace('\u00b7', '').includes(needle.replace('\u00b7', '').replace('.', '')) ||
      (digits.length >= 3 && (r.customer_phone_masked ?? '').replace(/\D/g, '').includes(digits))
    );
  });
  const counts = { all: scoped.length, seated: 0, noShow: 0, cancelled: 0 };
  for (const r of scoped) {
    const res = historyResult(r);
    if (res === 'SEATED') counts.seated += 1;
    else if (res === 'NO_SHOW') counts.noShow += 1;
    else if (res === 'CANCELLED') counts.cancelled += 1;
  }
  const want = ({ seated: 'SEATED', noshow: 'NO_SHOW', cancelled: 'CANCELLED', active: 'ACTIVE' } as const)[
    (q.result ?? '') as 'seated'
  ];
  const rows = want ? scoped.filter((r) => historyResult(r) === want) : scoped;

  const called = scoped.filter((r) => r.called_at != null);
  const avgWait = called.length
    ? Math.round(called.reduce((a, r) => a + waitedMins(r, now), 0) / called.length)
    : 0;
  const stats = {
    issued: scoped.length,
    served: counts.seated,
    avgWaitMins: avgWait,
    noShowPct: scoped.length ? Math.round((counts.noShow / scoped.length) * 100) : 0,
  };

  const out = rows.map((r) => ({
    id: r.id,
    displayNumber: r.display_number,
    customerName: r.customer_name,
    phoneMasked: maskPhone(r.customer_phone_masked),
    paxCount: r.pax_count,
    bucketPrefix: r.prefix,
    source: r.source === 'HOST_MANUAL' ? 'COUNTER' : 'ZALO',
    status: r.status,
    result: historyResult(r),
    createdAt: r.created_at,
    calledAt: r.called_at,
    heldAt: r.held_at,
    seatedAt: r.seated_at,
    cancelledAt: r.cancelled_at,
    waitedMins: waitedMins(r, now),
    zns: r.zns_at != null ? { sentAt: r.zns_at, amountVnd: Math.abs(r.zns_amount ?? 0) } : null,
    canRestore: r.status === 'CANCELLED' && date === vnDate(now),
    canRecall: r.status === 'HELD',
  }));

  if (q.format === 'csv') {
    const head = ['So', 'Khach', 'SDT', 'So khach', 'Ban', 'Nguon', 'Lay so', 'Goi', 'Den', 'Da cho (phut)', 'Ket qua', 'Tin Zalo'];
    const label: Record<HistResult, string> = { SEATED: 'Đã đến', NO_SHOW: 'Bỏ về', CANCELLED: 'Đã hủy', ACTIVE: 'Đang chờ' };
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(',')].concat(
      out.map((r) =>
        [
          r.displayNumber, r.customerName, r.phoneMasked, r.paxCount, r.bucketPrefix,
          r.source === 'COUNTER' ? 'Tại quầy' : 'Zalo', hhmm(r.createdAt), hhmm(r.calledAt), hhmm(r.seatedAt),
          r.waitedMins, label[r.result], r.zns ? 'Đã gửi' : '',
        ].map(esc).join(','),
      ),
    );
    return new Response('\ufeff' + lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="lich-su-${date}.csv"`,
      },
    });
  }

  return c.json({ date, counts, stats, rows: out });
});

/**
 * POST /api/manage/:branchId/tickets/:ticketId/restore — "Khôi phục số".
 * Puts a ticket cancelled *today* back to WAITING with its original number and
 * created_at (so it keeps its place). Not a state-machine transition: it is an
 * explicit manager override, refused if the guest already holds another active
 * ticket at this branch.
 */
manage.post('/:branchId/tickets/:ticketId/restore', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  const branchId = c.req.param('branchId');
  const t = await c.env.DB.prepare(
    `SELECT id, status, ticket_date, zalo_user_id FROM tickets WHERE id = ?1 AND branch_id = ?2`,
  )
    .bind(c.req.param('ticketId'), branchId)
    .first<{ id: string; status: string; ticket_date: string; zalo_user_id: string | null }>();
  if (!t) return c.json(apiError('Ticket not found', 'TICKET_NOT_FOUND'), 404);
  if (t.status !== 'CANCELLED' || t.ticket_date !== vnDate(Date.now())) {
    return c.json(apiError('Only tickets cancelled today can be restored', 'INVALID_TRANSITION'), 409);
  }
  if (t.zalo_user_id) {
    const other = await c.env.DB.prepare(
      `SELECT id FROM tickets WHERE branch_id = ?1 AND zalo_user_id = ?2 AND id != ?3
         AND status IN ('WAITING','CALLED','HELD') LIMIT 1`,
    )
      .bind(branchId, t.zalo_user_id, t.id)
      .first();
    if (other) return c.json(apiError('Guest already has an active ticket', 'ACTIVE_TICKET_EXISTS'), 409);
  }
  await c.env.DB.prepare(
    `UPDATE tickets SET status = 'WAITING', called_at = NULL, held_at = NULL, cancelled_at = NULL WHERE id = ?1`,
  )
    .bind(t.id)
    .run();
  return c.json({ ok: true, ticketId: t.id, status: 'WAITING' });
});

// ───────────────────────── Reports (M6) ─────────────────────────

type RepRow = {
  status: string;
  source: string;
  created_at: number;
  called_at: number | null;
  ticket_date: string;
  prefix: string;
  min_pax: number;
  max_pax: number;
  label_vi: string;
  zns: number | null;
};

export type RangeKey = 'today' | '7d' | '30d' | 'custom';

export function resolveRange(q: { range?: string; from?: string; to?: string }, nowMs: number) {
  const today = vnDate(nowMs);
  const key = (['today', '7d', '30d', 'custom'].includes(q.range ?? '') ? q.range : '7d') as RangeKey;
  let from = today;
  let to = today;
  if (key === '7d') from = addDays(today, -6);
  if (key === '30d') from = addDays(today, -29);
  if (key === 'custom') {
    if (!isDate(q.from) || !isDate(q.to) || q.from > q.to) return null;
    from = q.from;
    to = q.to;
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  if (days > 92) return null;
  return { key, from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

async function reportRows(db: D1Database, branchId: string, from: string, to: string): Promise<RepRow[]> {
  const res = await db
    .prepare(
      `SELECT t.status, t.source, t.created_at, t.called_at, t.ticket_date, q.prefix, q.min_pax, q.max_pax, q.label_vi,
              (SELECT COUNT(*) FROM wallet_ledger l WHERE l.ticket_id = t.id AND l.tx_type = 'ZNS_CALL_ALERT') AS zns
       FROM tickets t JOIN queue_buckets q ON q.id = t.bucket_id
       WHERE t.branch_id = ?1 AND t.ticket_date BETWEEN ?2 AND ?3`,
    )
    .bind(branchId, from, to)
    .all<RepRow>();
  return res.results ?? [];
}

function kpis(rows: RepRow[]) {
  const served = rows.filter((r) => r.status === 'SEATED').length;
  const called = rows.filter((r) => r.called_at != null);
  const avgWait = called.length
    ? Math.round(called.reduce((a, r) => a + (r.called_at! - r.created_at) / 60_000, 0) / called.length)
    : 0;
  const lost = rows.filter((r) => r.status === 'CANCELLED').length;
  const lostPct = rows.length ? Math.round((lost / rows.length) * 1000) / 10 : 0;
  const zns = rows.reduce((a, r) => a + (r.zns ?? 0), 0);
  return { issued: rows.length, served, avgWaitMins: avgWait, lostPct, znsSent: zns };
}

/** One actionable sentence for the "Gợi ý" card, or null when nothing stands out. */
export function suggestion(rows: RepRow[], days: number): string | null {
  const waits = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.called_at == null) continue;
    const h = new Date(r.created_at + VN_OFFSET_MS).getUTCHours();
    const k = `${r.prefix}|${h}`;
    const w = waits.get(k) ?? { sum: 0, n: 0 };
    w.sum += (r.called_at - r.created_at) / 60_000;
    w.n += 1;
    waits.set(k, w);
  }
  let best: { prefix: string; hour: number; avg: number } | null = null;
  for (const [k, w] of waits) {
    if (w.n < Math.max(2, days)) continue;
    const avg = w.sum / w.n;
    if (!best || avg > best.avg) {
      const [prefix, hour] = k.split('|');
      best = { prefix: prefix!, hour: Number(hour), avg };
    }
  }
  if (!best || best.avg < 15) return null;
  return `${best.hour}h–${best.hour + 1}h khách bàn ${best.prefix} chờ ${Math.round(best.avg)} phút. Mở thêm 1 quầy bàn ${best.prefix} giờ này có thể giảm bỏ về.`;
}

manage.get('/:branchId/reports', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  const now = Date.now();
  const range = resolveRange(c.req.query(), now);
  if (!range) return c.json(apiError('Invalid range', 'INVALID_RANGE'), 400);
  const branchId = c.req.param('branchId');
  const [rows, prev] = await Promise.all([
    reportRows(c.env.DB, branchId, range.from, range.to),
    reportRows(c.env.DB, branchId, range.prevFrom, range.prevTo),
  ]);
  const cur = kpis(rows);
  const before = kpis(prev);
  const byHourCount = new Map<number, number>();
  for (const r of rows) {
    const h = new Date(r.created_at + VN_OFFSET_MS).getUTCHours();
    byHourCount.set(h, (byHourCount.get(h) ?? 0) + 1);
  }
  const hours = [...byHourCount.keys()];
  const lo = hours.length ? Math.min(...hours, 10) : 10;
  const hi = hours.length ? Math.max(...hours, 21) : 21;
  const byHour = [];
  for (let h = lo; h <= hi; h += 1) byHour.push({ hour: h, avgPerDay: Math.round(((byHourCount.get(h) ?? 0) / range.days) * 10) / 10 });

  const buckets = new Map<string, { prefix: string; label: string; served: number; waitSum: number; waitN: number; noShow: number; total: number }>();
  for (const r of rows) {
    const b = buckets.get(r.prefix) ?? {
      prefix: r.prefix,
      label: r.min_pax === r.max_pax ? r.label_vi : `${r.min_pax}–${r.max_pax} khách`,
      served: 0, waitSum: 0, waitN: 0, noShow: 0, total: 0,
    };
    b.total += 1;
    if (r.status === 'SEATED') b.served += 1;
    if (r.status === 'CANCELLED') b.noShow += 1;
    if (r.called_at != null) {
      b.waitSum += (r.called_at - r.created_at) / 60_000;
      b.waitN += 1;
    }
    buckets.set(r.prefix, b);
  }
  const zalo = rows.filter((r) => r.source !== 'HOST_MANUAL').length;
  return c.json({
    range: { key: range.key, from: range.from, to: range.to, days: range.days },
    updatedAt: now,
    kpis: {
      ...cur,
      znsSpentVnd: cur.znsSent * 400,
      deltas: {
        servedPct: before.served ? Math.round(((cur.served - before.served) / before.served) * 100) : null,
        avgWaitMins: before.issued ? cur.avgWaitMins - before.avgWaitMins : null,
        lostPts: before.issued ? Math.round((cur.lostPct - before.lostPct) * 10) / 10 : null,
      },
    },
    byHour,
    buckets: [...buckets.values()]
      .sort((a, b) => a.prefix.localeCompare(b.prefix))
      .map((b) => ({
        prefix: b.prefix,
        label: b.label,
        served: b.served,
        avgWaitMins: b.waitN ? Math.round(b.waitSum / b.waitN) : 0,
        noShowPct: b.total ? Math.round((b.noShow / b.total) * 100) : 0,
      })),
    source: { zaloPct: rows.length ? Math.round((zalo / rows.length) * 100) : 0, counterPct: rows.length ? 100 - Math.round((zalo / rows.length) * 100) : 0 },
    suggestion: suggestion(rows, range.days),
  });
});

// ───────────────────────── QR & TV (M7) ─────────────────────────

manage.get('/:branchId/qr', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  const b = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.qr_code_token, b.slug, m.slug AS merchant_slug FROM branches b
     JOIN merchants m ON m.id = b.merchant_id WHERE b.id = ?1`,
  )
    .bind(c.req.param('branchId'))
    .first<{ id: string; name: string; qr_code_token: string; slug: string | null; merchant_slug: string }>();
  let tvConnected = 0;
  try {
    const stub = c.env.BRANCH_QUEUE_ROOM.get(c.env.BRANCH_QUEUE_ROOM.idFromName(b!.id));
    const res = await stub.fetch('https://branch-queue-room/stats');
    if (res.ok) tvConnected = ((await res.json()) as { tv?: number }).tv ?? 0;
  } catch {
    tvConnected = 0;
  }
  return c.json({
    branchId: b!.id,
    branchName: b!.name,
    qrToken: b!.qr_code_token,
    walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(b!.qr_code_token)}`,
    tvSlug: b!.slug ?? b!.merchant_slug,
    tvConnected,
    checkedAt: Date.now(),
  });
});

/** POST /api/manage/:branchId/qr/regenerate — old printed QR stops working. */
manage.post('/:branchId/qr/regenerate', async (c) => {
  const denied = await gate(c);
  if (denied) return denied;
  const branchId = c.req.param('branchId');
  const b = await c.env.DB.prepare(`SELECT qr_code_token FROM branches WHERE id = ?1`).bind(branchId).first<{ qr_code_token: string }>();
  const base = (b?.qr_code_token ?? 'qr').replace(/-r[0-9a-z]{6}$/, '');
  const token = `${base}-r${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`.slice(0, 64);
  await c.env.DB.prepare(`UPDATE branches SET qr_code_token = ?1 WHERE id = ?2`).bind(token, branchId).run();
  return c.json({ ok: true, qrToken: token, walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(token)}` });
});

export { manage };
