import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { distanceM } from '../src/routes/branches';
import { signGuestJwt } from '../src/services/jwt';
import { addTickets, applySchema, resetWorld, W } from './helpers/world';

type Row = { id: string; waitingCount: number; estimatedWaitMins: number | null; isPaused: boolean; pauseReason: string | null; distanceM: number | null; address: string };
type Resp = { branches: Row[]; activeTicket: { id: string; displayNumber: string; partiesAhead: number; branchName: string } | null; located: boolean };
const list = async (qs = '', headers: Record<string, string> = {}) => (await (await SELF.fetch(`http://x/api/branches${qs}`, { headers })).json()) as Resp;

beforeAll(async () => { await applySchema(env.DB, env.TEST_SCHEMA_SQL); });
beforeEach(async () => { await resetWorld(env.DB); });

describe('GET /api/branches (G1 marketplace)', () => {
  it('adds wait, effective pause and no distance without location', async () => {
    await addTickets(env.DB, [{ id: 't1', num: 'A·001' }, { id: 't2', num: 'A·002' }]);
    await env.DB.prepare(`UPDATE branches SET is_paused = 1 WHERE id = ?1`).bind(W.branch2).run();
    const j = await list();
    const b1 = j.branches.find((b) => b.id === W.branch)!;
    expect(b1).toMatchObject({ waitingCount: 2, isPaused: false, distanceM: null, address: '56 Nguyễn Huệ' });
    expect(b1.estimatedWaitMins).toEqual(expect.any(Number));
    expect(j.branches.find((b) => b.id === W.branch2)).toMatchObject({ isPaused: true, pauseReason: 'MANUAL' });
    expect(j).toMatchObject({ activeTicket: null, located: false });
  });

  it('computes distance and sorts nearest first only when lat/lng are given', async () => {
    await env.DB.prepare(`UPDATE branches SET lat = 10.7743, lng = 106.7038 WHERE id = ?1`).bind(W.branch).run();
    await env.DB.prepare(`UPDATE branches SET lat = 10.7765, lng = 106.6880 WHERE id = ?1`).bind(W.branch2).run();
    const j = await list('?lat=10.7766&lng=106.6879');
    expect(j.located).toBe(true);
    expect(j.branches[0]!.id).toBe(W.branch2);
    expect(j.branches[0]!.distanceM).toBeLessThan(50);
    expect(j.branches[1]!.distanceM).toBeGreaterThan(1500);
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(111_000);
  });

  it('returns the guest active ticket with parties ahead', async () => {
    await addTickets(env.DB, [
      { id: 't1', num: 'A·001', createdAt: Date.now() - 60_000 },
      { id: 't2', num: 'A·002', zaloUserId: 'z-me' },
    ]);
    const token = await signGuestJwt(env.JWT_SECRET!, { sub: 'g-me', zid: 'z-me' });
    const j = await list('', { Authorization: `Bearer ${token}` });
    expect(j.activeTicket).toMatchObject({ id: 't2', displayNumber: 'A·002', partiesAhead: 1 });
  });

  it('ACTIVE_TICKET_EXISTS carries the pinned ticket', async () => {
    await addTickets(env.DB, [{ id: 't9', num: 'A·009', zaloUserId: 'z-dup' }]);
    const token = await signGuestJwt(env.JWT_SECRET!, { sub: 'g', zid: 'z-dup' });
    const res = await SELF.fetch('http://x/api/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branchId: W.branch, paxCount: 2, customerName: 'Lan' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ACTIVE_TICKET_EXISTS', activeTicket: { id: 't9', displayNumber: 'A·009' } });
  });
});
