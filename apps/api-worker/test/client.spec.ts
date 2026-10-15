import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { validateBuckets } from '../src/routes/client';
import { addTickets, applySchema, resetWorld, W } from './helpers/world';

const CLIENT = { 'X-Dev-Actor': 'CLIENT_ADMIN', 'X-Dev-Client-Id': W.client, 'Content-Type': 'application/json' };
const OTHER_CLIENT = { 'X-Dev-Actor': 'CLIENT_ADMIN', 'X-Dev-Client-Id': 'client-nope' };
const MANAGER = { 'X-Dev-Actor': 'BRANCH_MANAGER', 'X-Dev-Branch-Id': W.branch };
const api = (path: string, init: RequestInit = {}) =>
  SELF.fetch(`http://x/api/client${path}`, { ...init, headers: { ...CLIENT, ...(init.headers ?? {}) } });

beforeAll(async () => { await applySchema(env.DB, env.TEST_SCHEMA_SQL); });
beforeEach(async () => { await resetWorld(env.DB); });

type Setup = { buckets: { prefix: string; minPax: number; maxPax: number; isActive: boolean; activeCounters: number; labelVi: string }[]; wallet: { balanceVnd: number; messages: number; sharedAcrossBrand: boolean }; vietQrMemo: string; routingMode: string; ledger: unknown[] };

describe('client · portfolio (M2)', () => {
  it('returns KPIs across brands and per-branch stats + wallet', async () => {
    const t0 = Date.now() - 20 * 60_000;
    await addTickets(env.DB, [
      { id: 't1', num: 'A·001', status: 'WAITING' }, { id: 't2', num: 'A·002', status: 'WAITING' },
      { id: 't3', num: 'A·003', status: 'SEATED', createdAt: t0, calledAt: t0 + 10 * 60_000, seatedAt: t0 + 12 * 60_000 },
    ]);
    const j = (await (await api('/portfolio')).json()) as {
      kpis: { waiting: number; servedToday: number; totalBranches: number };
      brands: { planTier: string; walletBalanceVnd: number; walletMessages: number; branches: { id: string; waitingCount: number; servedToday: number; tvSlug: string }[] }[];
    };
    expect(j.kpis).toMatchObject({ waiting: 2, servedToday: 1, totalBranches: 2 });
    expect(j.brands[0]).toMatchObject({ planTier: 'PRO', walletBalanceVnd: 50_000, walletMessages: 125 });
    expect(j.brands[0]!.branches.find((b) => b.id === W.branch)).toMatchObject({ waitingCount: 2, servedToday: 1 });
  });
});

describe('client · branch setup (M3)', () => {
  it('gates: manager 403, other client 403, owner 200', async () => {
    expect((await SELF.fetch(`http://x/api/client/branches/${W.branch}`, { headers: MANAGER })).status).toBe(403);
    expect((await SELF.fetch(`http://x/api/client/branches/${W.branch}`, { headers: OTHER_CLIENT })).status).toBe(403);
    expect((await SELF.fetch('http://x/api/client/branches/nope', { headers: CLIENT })).status).toBe(404);
    const s = (await (await api(`/branches/${W.branch}`)).json()) as Setup;
    expect(s.wallet).toMatchObject({ balanceVnd: 50_000, messages: 125, sharedAcrossBrand: true });
    expect(s.vietQrMemo).toBe('LUOTDI pho-w');
  });

  it('saves a full bucket set, adds D, deactivates removed buckets', async () => {
    const res = await api(`/branches/${W.branch}/buckets`, {
      method: 'PUT',
      body: JSON.stringify({
        routingMode: 'PARTY_SIZE',
        buckets: [
          { prefix: 'A', minPax: 1, maxPax: 3, activeCounters: 4, isActive: true },
          { prefix: 'D', minPax: 4, maxPax: 12, activeCounters: 2, isActive: true },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const s = (await res.json()) as Setup;
    expect(s.buckets.map((b) => [b.prefix, b.isActive])).toEqual([['A', true], ['B', false], ['D', true]]);
    expect(s.buckets.find((b) => b.prefix === 'D')).toMatchObject({ minPax: 4, maxPax: 12, labelVi: '4–12 khách' });
  });

  it('rejects gaps/overlaps with a coverage message', async () => {
    const res = await api(`/branches/${W.branch}/buckets`, {
      method: 'PUT',
      body: JSON.stringify({ routingMode: 'PARTY_SIZE', buckets: [
        { prefix: 'A', minPax: 1, maxPax: 2, activeCounters: 4, isActive: true },
        { prefix: 'B', minPax: 4, maxPax: 6, activeCounters: 1, isActive: true },
      ] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_BUCKETS', coverage: 'Khách 3 người chưa có bàn', fields: { B: 'Hở khoảng khách' } });
    expect(validateBuckets('PARTY_SIZE', [
      { prefix: 'A', minPax: 1, maxPax: 4, activeCounters: 1, isActive: true },
      { prefix: 'B', minPax: 3, maxPax: 6, activeCounters: 1, isActive: true },
    ])?.coverage).toBe('Bàn B trùng khoảng khách với bàn trước');
    expect(validateBuckets('SERVICE_TYPE', [{ prefix: 'A', labelVi: '', minPax: 1, maxPax: 1, activeCounters: 1, isActive: true }])?.fields.A).toBe('Nhập tên dịch vụ');
    expect(validateBuckets('SERVICE_TYPE', [{ prefix: 'A', labelVi: 'Khám tổng quát', minPax: 1, maxPax: 1, activeCounters: 1, isActive: true }])).toBeNull();
  });

  it('topup returns VietQR details with the brand memo; validates amount', async () => {
    const ok = await api(`/branches/${W.branch}/topup`, { method: 'POST', body: JSON.stringify({ amountVnd: 100_000 }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ amountVnd: 100_000, memo: 'LUOTDI pho-w', bank: { bankName: 'Vietcombank' } });
    expect((await api(`/branches/${W.branch}/topup`, { method: 'POST', body: JSON.stringify({ amountVnd: 5 }) })).status).toBe(400);
  });
});
