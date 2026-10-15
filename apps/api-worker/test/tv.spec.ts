import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { addTickets, applySchema, resetWorld, W } from './helpers/world';

type TvBody = {
  branchId: string;
  branchSlug: string;
  isPaused: boolean;
  servedToday: number;
  nowServing: { displayNumber: string; bucketPrefix: string; calledAt: number } | null;
  recent: { displayNumber: string }[];
  buckets: { prefix: string; next: string[]; partiesWaiting: number; estimatedWaitMins: number }[];
};

const MID = '\u00B7';
const n = (p: string, i: number) => `${p}${MID}${String(i).padStart(3, '0')}`;

describe('GET /api/branches/:id/tv (round 4)', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });
  beforeEach(async () => {
    await resetWorld(env.DB);
  });

  it('returns nowServing, recent calls and the next 3 per bucket — numbers only', async () => {
    const t = Date.now();
    await addTickets(env.DB, [
      { id: 's1', num: n('A', 1), status: 'SEATED', calledAt: t - 50_000, seatedAt: t - 40_000 },
      { id: 's2', num: n('B', 1), status: 'SEATED', bucket: W.bucketB, calledAt: t - 40_000 },
      { id: 'h1', num: n('A', 2), status: 'HELD', calledAt: t - 30_000, heldAt: t - 20_000 },
      { id: 'c1', num: n('A', 3), status: 'CALLED', calledAt: t - 10_000, name: 'Nguyễn Văn Bí Mật' },
      ...[4, 5, 6, 7].map((i) => ({ id: `w${i}`, num: n('A', i) })),
      { id: 'wb', num: n('B', 2), bucket: W.bucketB },
      { id: 'other', num: n('A', 1), branch: W.branch2, bucket: W.bucket2A },
    ]);
    const res = await SELF.fetch(`http://x/api/branches/${W.branch}/tv`);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('Bí Mật');
    const body = JSON.parse(raw) as TvBody;
    expect(body.nowServing?.displayNumber).toBe(n('A', 3));
    expect(body.nowServing?.bucketPrefix).toBe('A');
    expect(body.recent.map((r) => r.displayNumber)).toEqual([n('A', 2), n('B', 1), n('A', 1)]);
    const a = body.buckets.find((b) => b.prefix === 'A')!;
    expect(a.next).toEqual([n('A', 4), n('A', 5), n('A', 6)]);
    expect(a.partiesWaiting).toBe(4);
    const b = body.buckets.find((x) => x.prefix === 'B')!;
    expect(b.next).toEqual([n('B', 2)]);
    expect(body.servedToday).toBe(2);
    expect(body.branchSlug).toBe('pho-w-nh');
  });

  it('nowServing is null when the latest call is already seated; empty buckets wait 0', async () => {
    const t = Date.now();
    await addTickets(env.DB, [{ id: 's1', num: n('A', 1), status: 'SEATED', calledAt: t - 5000 }]);
    const body = (await (await SELF.fetch(`http://x/api/branches/${W.branch}/tv`)).json()) as TvBody;
    expect(body.nowServing).toBeNull();
    expect(body.recent.map((r) => r.displayNumber)).toEqual([n('A', 1)]);
    expect(body.buckets.every((b) => b.next.length === 0 && b.estimatedWaitMins === 0)).toBe(true);
  });

  it('per-branch slug resolves the right branch; merchant slug still falls back', async () => {
    await addTickets(env.DB, [{ id: 'q3', num: n('A', 9), branch: W.branch2, bucket: W.bucket2A }]);
    const q3 = (await (await SELF.fetch('http://x/api/branches/slug/pho-w-q3')).json()) as TvBody;
    expect(q3.branchId).toBe(W.branch2);
    expect(q3.buckets[0]!.next).toEqual([n('A', 9)]);
    const legacy = (await (await SELF.fetch('http://x/api/branches/slug/pho-w')).json()) as TvBody;
    expect(legacy.branchId).toBe(W.branch);
    expect((await SELF.fetch('http://x/api/branches/slug/nope')).status).toBe(404);
  });

  it('reports paused', async () => {
    await resetWorld(env.DB, { paused: true });
    const body = (await (await SELF.fetch(`http://x/api/branches/${W.branch}/tv`)).json()) as TvBody;
    expect(body.isPaused).toBe(true);
  });
});
