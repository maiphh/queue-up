import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../src/index';
import { resolveActor, staffHeadersTrusted } from '../src/services/actor';
import { hashPassword, signGuestJwt, signStaffJwt, verifyGuestJwt, verifyPassword } from '../src/services/jwt';
import { applySchema, resetWorld, W } from './helpers/world';

const SECRET = 'test-jwt-secret-0123456789abcdef';
const PROD = { ENVIRONMENT: 'production', JWT_SECRET: SECRET };
const SPOOF: Record<string, string>[] = [
  { 'X-Dev-Actor': 'PLATFORM_ADMIN' },
  { 'X-Test-Staff-Role': 'SUPER_ADMIN' },
  { 'X-Test-Staff-Role': 'BRANCH_HOST' },
  { 'X-Dev-Actor': 'CLIENT_ADMIN', 'X-Dev-Client-Id': 'client-w' },
  { 'X-Dev-Actor': 'BRANCH_MANAGER', 'X-Dev-Branch-Id': 'branch-w1' },
];

async function addStaff(id: string, email: string, role: string, password: string, extra: { client?: string; branch?: string } = {}) {
  await env.DB.prepare(
    `INSERT INTO staff_users (id, merchant_id, branch_id, client_id, email, password_hash, role, created_at)
     VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(id, extra.branch ?? null, extra.client ?? null, email, await hashPassword(password, 2000), role, Date.now()).run();
  if (extra.branch) {
    await env.DB.prepare(`INSERT INTO staff_branch_assignments (staff_id, branch_id) VALUES (?1, ?2)`).bind(id, extra.branch).run();
  }
}
const login = (email: string, password: string) =>
  SELF.fetch('http://x/api/auth/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => { await applySchema(env.DB, env.TEST_SCHEMA_SQL); });
beforeEach(async () => { await resetWorld(env.DB); });

describe('production rejects spoofed staff headers', () => {
  it('only dev or the vitest flag trust headers', () => {
    expect(staffHeadersTrusted({ ENVIRONMENT: 'production' })).toBe(false);
    expect(staffHeadersTrusted({ ENVIRONMENT: 'staging' })).toBe(false);
    expect(staffHeadersTrusted({})).toBe(false);
    expect(staffHeadersTrusted({ ENVIRONMENT: 'dev' })).toBe(true);
  });

  it.each(SPOOF)('resolveActor(%o) → 401 in production', async (h) => {
    expect(await resolveActor(new Headers(h), PROD)).toEqual({ ok: false, status: 401, code: 'UNAUTHORIZED' });
  });

  it('a guest JWT is never a staff session, and a staff JWT is never a guest session', async () => {
    const guest = await signGuestJwt(SECRET, { sub: 'g', zid: 'z' });
    expect((await resolveActor(new Headers(bearer(guest)), PROD)).ok).toBe(false);
    const staff = await signStaffJwt(SECRET, { sub: 's', role: 'PLATFORM_ADMIN' });
    expect(await verifyGuestJwt(SECRET, staff)).toBeNull();
  });

  it('rejects forged, expired or tampered staff tokens', async () => {
    const forged = await signStaffJwt('other-secret-0123456789abcdef-xx', { sub: 's', role: 'PLATFORM_ADMIN' });
    const expired = await signStaffJwt(SECRET, { sub: 's', role: 'PLATFORM_ADMIN' }, Date.now() - 13 * 3600_000);
    const real = await signStaffJwt(SECRET, { sub: 's', role: 'BRANCH_MANAGER', branchIds: ['b1'] });
    const [h, p, sig] = real.split('.');
    const body = JSON.parse(atob(p!.replace(/-/g, '+').replace(/_/g, '/')));
    const tampered = `${h}.${btoa(JSON.stringify({ ...body, role: 'PLATFORM_ADMIN' })).replace(/=+$/, '')}.${sig}`;
    for (const t of [forged, expired, tampered, 'garbage']) {
      expect((await resolveActor(new Headers(bearer(t)), PROD)).ok).toBe(false);
    }
  });

  it('a spoofed header cannot upgrade a valid manager token', async () => {
    const t = await signStaffJwt(SECRET, { sub: 's', role: 'BRANCH_MANAGER', branchIds: ['b1'] });
    const r = await resolveActor(new Headers({ ...bearer(t), 'X-Dev-Actor': 'PLATFORM_ADMIN' }), PROD);
    expect(r).toMatchObject({ ok: true, actor: { role: 'BRANCH_MANAGER', branchIds: ['b1'] } });
  });
});

describe('POST /api/auth/staff', () => {
  it('logs in with email + password and the token opens scoped routes', async () => {
    await addStaff('s-mgr', 'mgr@w.vn', 'BRANCH_MANAGER', 'hunter2-long', { branch: W.branch });
    const res = await login('MGR@w.vn', 'hunter2-long');
    expect(res.status).toBe(200);
    const { token, staff } = (await res.json()) as { token: string; staff: { role: string; branchIds: string[] } };
    expect(staff).toMatchObject({ role: 'BRANCH_MANAGER', branchIds: [W.branch] });
    expect((await SELF.fetch(`http://x/api/manage/${W.branch}/settings`, { headers: bearer(token) })).status).toBe(200);
    expect((await SELF.fetch(`http://x/api/manage/${W.branch2}/settings`, { headers: bearer(token) })).status).toBe(403);
    expect((await SELF.fetch('http://x/api/admin/overview', { headers: bearer(token) })).status).toBe(403);
    const me = (await (await SELF.fetch('http://x/api/auth/staff/me', { headers: bearer(token) })).json()) as { actor: { role: string } };
    expect(me.actor.role).toBe('BRANCH_MANAGER');
  });

  it('client token is scoped to its own client; admin token reaches admin', async () => {
    await addStaff('s-cli', 'cli@w.vn', 'CLIENT_ADMIN', 'pw-client-123', { client: W.client });
    await addStaff('s-adm', 'adm@w.vn', 'PLATFORM_ADMIN', 'pw-admin-123');
    const cli = ((await (await login('cli@w.vn', 'pw-client-123')).json()) as { token: string }).token;
    const adm = ((await (await login('adm@w.vn', 'pw-admin-123')).json()) as { token: string }).token;
    expect((await SELF.fetch('http://x/api/client/portfolio', { headers: bearer(cli) })).status).toBe(200);
    expect((await SELF.fetch(`http://x/api/client/branches/${W.branch}`, { headers: bearer(cli) })).status).toBe(200);
    expect((await SELF.fetch('http://x/api/admin/overview', { headers: bearer(cli) })).status).toBe(403);
    expect((await SELF.fetch('http://x/api/admin/overview', { headers: bearer(adm) })).status).toBe(200);
  });

  it('same 401 for a wrong password, an unknown email and the seed placeholder hash', async () => {
    await addStaff('s1', 'a@w.vn', 'PLATFORM_ADMIN', 'right-password');
    await env.DB.prepare(
      `INSERT INTO staff_users (id, email, password_hash, role, created_at) VALUES ('s2', 'seed@w.vn', 'dev-only-not-a-real-hash', 'PLATFORM_ADMIN', 0)`,
    ).run();
    for (const [e, p] of [['a@w.vn', 'wrong'], ['nobody@w.vn', 'x'], ['seed@w.vn', 'dev-only-not-a-real-hash']] as const) {
      const r = await login(e, p);
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    expect((await login('', '')).status).toBe(400);
  });

  it('dev staff login is 404 outside ENVIRONMENT=dev', async () => {
    const r = await SELF.fetch('http://x/api/auth/staff/dev', { method: 'POST', body: JSON.stringify({ email: 'admin@luotdi.vn' }) });
    expect(r.status).toBe(404);
  });

  it('password hashes verify and never store the plain text', async () => {
    const h = await hashPassword('s3cret!', 2000);
    expect(h).toMatch(/^pbkdf2\$2000\$/);
    expect(h).not.toContain('s3cret');
    expect(await verifyPassword('s3cret!', h)).toBe(true);
    expect(await verifyPassword('s3cret?', h)).toBe(false);
  });
});
