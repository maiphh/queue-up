import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { addTickets, applySchema, resetWorld, W } from './helpers/world';

const ADMIN = { 'X-Dev-Actor': 'PLATFORM_ADMIN', 'Content-Type': 'application/json' };
const BODY = {
  clientName: 'Nhóm Bếp Việt', brandName: 'Bún Chả Hương Liên', industryType: 'RESTAURANT', branchName: 'Lê Văn Hưu',
  address: '24 Lê Văn Hưu', district: 'Hai Bà Trưng', routingMode: 'PARTY_SIZE', planTier: 'FREE',
};
const post = (body: unknown) => SELF.fetch('http://x/api/admin/clients', { method: 'POST', headers: ADMIN, body: JSON.stringify(body) });

beforeAll(async () => { await applySchema(env.DB, env.TEST_SCHEMA_SQL); });
beforeEach(async () => { await resetWorld(env.DB); });

describe('admin · overview (M1)', () => {
  it('returns KPIs and a Cần chú ý list (low wallet, long pause, silent)', async () => {
    await env.DB.prepare(`UPDATE merchants SET wallet_balance_vnd = 800 WHERE id = ?1`).bind(W.merchant).run();
    await env.DB.prepare(`UPDATE branches SET is_paused = 1, paused_at = ?1 WHERE id = ?2`).bind(Date.now() - 42 * 60_000, W.branch2).run();
    await addTickets(env.DB, [{ id: 't1', num: 'A·001', status: 'WAITING' }]);
    const j = (await (await SELF.fetch('http://x/api/admin/overview', { headers: ADMIN })).json()) as {
      kpis: { waitingTotal: number; ticketsToday: number; pausedBranches: number; lowWalletBrands: number; lowWalletFirst: { balanceVnd: number } };
      attention: { kind: string; title: string }[];
      clients: { brands: { walletLow: boolean; monthlyQuota: number | null; branches: { slug: string }[] }[] }[];
    };
    expect(j.kpis).toMatchObject({ waitingTotal: 1, ticketsToday: 1, pausedBranches: 1, lowWalletBrands: 1, lowWalletFirst: { balanceVnd: 800 } });
    expect(j.attention.map((a) => a.kind).sort()).toEqual(['LONG_PAUSE', 'LOW_WALLET']);
    expect(j.attention.find((a) => a.kind === 'LONG_PAUSE')?.title).toMatch(/tạm dừng 4[23] phút/);
    expect(j.clients[0]!.brands[0]!.branches.map((b) => b.slug)).toContain('pho-w-nh');
  });

  it('pause stamps paused_at and resume clears it', async () => {
    const H = { 'X-Dev-Actor': 'BRANCH_MANAGER', 'X-Dev-Branch-Id': W.branch, 'Content-Type': 'application/json', 'X-Test-Staff-Role': 'BRANCH_MANAGER' };
    await SELF.fetch(`http://x/api/branches/${W.branch}/pause`, { method: 'POST', headers: H, body: JSON.stringify({ paused: true }) });
    const a = await env.DB.prepare(`SELECT paused_at FROM branches WHERE id = ?1`).bind(W.branch).first<{ paused_at: number | null }>();
    expect(a?.paused_at).toEqual(expect.any(Number));
    await SELF.fetch(`http://x/api/branches/${W.branch}/pause`, { method: 'POST', headers: H, body: JSON.stringify({ paused: false }) });
    const b = await env.DB.prepare(`SELECT paused_at FROM branches WHERE id = ?1`).bind(W.branch).first<{ paused_at: number | null }>();
    expect(b?.paused_at).toBeNull();
  });
});

describe('admin · onboarding (M1b)', () => {
  it('creates client/brand/branch with TV slug, hold time and full-coverage buckets', async () => {
    const res = await post({ ...BODY, tvSlug: 'huong-lien-lvh', graceMins: 12 });
    expect(res.status).toBe(201);
    const j = (await res.json()) as { branchId: string; tvSlug: string; walkInQrUrl: string };
    expect(j.tvSlug).toBe('huong-lien-lvh');
    const br = await env.DB.prepare(`SELECT slug, grace_period_mins FROM branches WHERE id = ?1`).bind(j.branchId).first();
    expect(br).toEqual({ slug: 'huong-lien-lvh', grace_period_mins: 12 });
    const qb = await env.DB.prepare(`SELECT prefix, min_pax, max_pax FROM queue_buckets WHERE branch_id = ?1 ORDER BY prefix`).bind(j.branchId).all();
    expect(qb.results).toEqual([
      { prefix: 'A', min_pax: 1, max_pax: 2 }, { prefix: 'B', min_pax: 3, max_pax: 4 }, { prefix: 'C', min_pax: 5, max_pax: 12 },
    ]);
    expect((await SELF.fetch('http://x/api/branches/slug/huong-lien-lvh')).status).toBe(200);
  });

  it('auto-generates a branch slug; rejects duplicate slug (409) and bad fields (400)', async () => {
    const auto = (await (await post(BODY)).json()) as { tvSlug: string };
    expect(auto.tvSlug).toMatch(/^bun-cha-huong-lien-le-van-huu/);
    const dup = await post({ ...BODY, tvSlug: 'pho-w-nh' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: 'SLUG_TAKEN', fields: { tvSlug: expect.any(String) } });
    const bad = await post({ ...BODY, tvSlug: 'Có Dấu', graceMins: 99 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ fields: { tvSlug: expect.any(String), graceMins: 'Từ 3 đến 30 phút' } });
  });
});
