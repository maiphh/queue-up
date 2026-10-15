import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { signGuestJwt } from '../src/services/jwt';
import { addTickets, applySchema, resetWorld, type TicketSeed } from './helpers/world';

const tok = (zid: string) => signGuestJwt(env.JWT_SECRET!, { sub: `g-${zid}`, zid });
const cancel = async (id: string, auth?: string) =>
  SELF.fetch(`http://x/api/tickets/${id}/cancel`, { method: 'POST', headers: auth ? { Authorization: auth } : {} });
const seat = (id: string) =>
  SELF.fetch(`http://x/api/host/tickets/${id}/action`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Test-Staff-Role': 'BRANCH_HOST' },
    body: JSON.stringify({ action: 'SEAT' }),
  });
const statusOf = async (id: string) =>
  (await env.DB.prepare(`SELECT status FROM tickets WHERE id = ?1`).bind(id).first<{ status: string }>())?.status;
const one = (id: string, extra: Partial<TicketSeed> = {}) => addTickets(env.DB, [{ id, num: 'A·001', zaloUserId: 'z-me', ...extra }]);

beforeAll(async () => { await applySchema(env.DB, env.TEST_SCHEMA_SQL); });
beforeEach(async () => { await resetWorld(env.DB); });

describe('POST /api/tickets/:id/cancel (guest)', () => {
  it('401 with no token, a malformed token, or a bad signature', async () => {
    await one('t1');
    expect((await cancel('t1')).status).toBe(401);
    expect((await cancel('t1', 'Bearer not.a.jwt')).status).toBe(401);
    const forged = await signGuestJwt('some-other-secret-0123456789abcdef', { sub: 'g', zid: 'z-me' });
    expect((await cancel('t1', `Bearer ${forged}`)).status).toBe(401);
    expect(await statusOf('t1')).toBe('WAITING');
  });

  it("404 for another guest's ticket, an anonymous ticket, or a missing id", async () => {
    await addTickets(env.DB, [
      { id: 't1', num: 'A·001', zaloUserId: 'z-me' },
      { id: 't2', num: 'A·002', zaloUserId: null },
    ]);
    const other = `Bearer ${await tok('z-other')}`;
    expect((await cancel('t1', other)).status).toBe(404);
    expect((await cancel('t2', other)).status).toBe(404);
    expect((await cancel('nope', other)).status).toBe(404);
    expect(await statusOf('t1')).toBe('WAITING');
  });

  for (const status of ['WAITING', 'CALLED', 'HELD'] as const) {
    it(`200 for ${status}`, async () => {
      await one('t1', { status, calledAt: status === 'WAITING' ? null : Date.now() - 60_000, heldAt: status === 'HELD' ? Date.now() : null });
      const res = await cancel('t1', `Bearer ${await tok('z-me')}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: 't1', status: 'CANCELLED' });
      const row = await env.DB.prepare(`SELECT status, cancelled_at FROM tickets WHERE id = 't1'`).first<{ status: string; cancelled_at: number }>();
      expect(row).toMatchObject({ status: 'CANCELLED', cancelled_at: expect.any(Number) });
    });
  }

  for (const status of ['SEATED', 'CANCELLED'] as const) {
    it(`409 for terminal ${status}`, async () => {
      await one('t1', { status });
      const res = await cancel('t1', `Bearer ${await tok('z-me')}`);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(await statusOf('t1')).toBe(status);
    });
  }

  it('the guest behind moves up', async () => {
    const now = Date.now();
    await addTickets(env.DB, [
      { id: 'front', num: 'A·001', zaloUserId: 'z-front', createdAt: now - 120_000 },
      { id: 'back', num: 'A·002', zaloUserId: 'z-back', createdAt: now - 60_000 },
    ]);
    const backAuth = { headers: { Authorization: `Bearer ${await tok('z-back')}` } };
    const ahead = async () => ((await (await SELF.fetch('http://x/api/tickets/back', backAuth)).json()) as { partiesAhead: number }).partiesAhead;
    expect(await ahead()).toBe(1);
    expect((await cancel('front', `Bearer ${await tok('z-front')}`)).status).toBe(200);
    expect(await ahead()).toBe(0);
  });

  it('racing a host SEAT: exactly one wins, the other gets 409', async () => {
    for (let i = 0; i < 5; i++) {
      await resetWorld(env.DB);
      await one('t1', { status: 'CALLED', calledAt: Date.now() - 30_000 });
      const auth = `Bearer ${await tok('z-me')}`;
      const [c, s] = await Promise.all([cancel('t1', auth), seat('t1')]);
      const codes = [c.status, s.status].sort();
      expect(codes).toEqual([200, 409]);
      expect(await statusOf('t1')).toBe(c.status === 200 ? 'CANCELLED' : 'SEATED');
    }
  });

  it('two cancels in parallel: one 200, one 409', async () => {
    await one('t1');
    const auth = `Bearer ${await tok('z-me')}`;
    const codes = (await Promise.all([cancel('t1', auth), cancel('t1', auth)])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 409]);
  });
});
