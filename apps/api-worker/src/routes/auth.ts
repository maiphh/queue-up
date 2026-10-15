import { Hono } from 'hono';
import type { Env } from '../index';
import { signGuestJwt, signStaffJwt, verifyPassword, type StaffRole } from '../services/jwt';
import { resolveActor } from '../services/actor';
import { fetchZaloProfile, upsertGuestUser } from '../services/zalo-auth';

const auth = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

/**
 * POST /api/auth/zalo { accessToken } → { token, guest }
 * accessToken comes from zmp-sdk `getAccessToken()`; verified via graph.zalo.me.
 */
auth.post('/zalo', async (c) => {
  if (!c.env.ZALO_APP_SECRET || !c.env.JWT_SECRET) {
    return c.json(apiError('Auth not configured', 'AUTH_NOT_CONFIGURED'), 500);
  }
  let body: { accessToken?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON body', 'INVALID_BODY'), 400);
  }
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    return c.json(apiError('accessToken required', 'INVALID_BODY'), 400);
  }

  let result;
  try {
    result = await fetchZaloProfile(body.accessToken, c.env.ZALO_APP_SECRET);
  } catch (err) {
    const zaloMessage = err instanceof Error ? err.message : 'graph request failed';
    console.error('[auth/zalo] graph request threw', zaloMessage);
    return c.json(
      { ...apiError('Zalo token rejected', 'ZALO_AUTH_FAILED'), zaloError: null, zaloMessage },
      401,
    );
  }
  if (!result.ok) {
    console.error('[auth/zalo] graph rejected', result.zaloError, result.zaloMessage);
    return c.json(
      {
        ...apiError('Zalo token rejected', 'ZALO_AUTH_FAILED'),
        zaloError: result.zaloError,
        zaloMessage: result.zaloMessage,
      },
      401,
    );
  }
  const profile = result.profile;

  const guestId = await upsertGuestUser(c.env.DB, profile);
  const token = await signGuestJwt(c.env.JWT_SECRET, {
    sub: guestId,
    zid: profile.id,
    ...(profile.name ? { name: profile.name } : {}),
  });
  return c.json({
    token,
    guest: { id: guestId, name: profile.name ?? null, avatarUrl: profile.avatarUrl ?? null },
  });
});

/**
 * POST /api/auth/dev { devUserId?, name? } — browser-only dev login.
 * Enabled only when ENVIRONMENT === 'dev' (local .dev.vars); 404 everywhere else.
 */
auth.post('/dev', async (c) => {
  if (c.env.ENVIRONMENT !== 'dev') {
    return c.json(apiError('Not found', 'NOT_FOUND'), 404);
  }
  if (!c.env.JWT_SECRET) {
    return c.json(
      apiError(
        'JWT_SECRET missing: copy apps/api-worker/.dev.vars.example to .dev.vars',
        'DEV_MISCONFIGURED',
      ),
      500,
    );
  }
  const body = (await c.req.json().catch(() => ({}))) as { devUserId?: unknown; name?: unknown };
  const raw = typeof body.devUserId === 'string' ? body.devUserId.trim() : '';
  const devId = (raw || 'dev-guest').slice(0, 64);
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 64)
      : raw || 'Dev Guest';
  const profile = { id: `dev:${devId}`, name };
  const guestId = await upsertGuestUser(c.env.DB, profile);
  const token = await signGuestJwt(c.env.JWT_SECRET, {
    sub: guestId,
    zid: profile.id,
    name: profile.name,
  });
  return c.json({ token, guest: { id: guestId, name: profile.name, avatarUrl: null } });
});

type StaffRow = { id: string; email: string; role: string; client_id: string | null; branch_id: string | null; password_hash: string };
const STAFF_ROLES: StaffRole[] = ['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'BRANCH_MANAGER'];

async function staffSession(env: Env, row: StaffRow) {
  const role = row.role as StaffRole;
  const assigned = await env.DB.prepare(`SELECT branch_id FROM staff_branch_assignments WHERE staff_id = ?1`)
    .bind(row.id)
    .all<{ branch_id: string }>();
  const branchIds = [...new Set([...(row.branch_id ? [row.branch_id] : []), ...(assigned.results ?? []).map((r) => r.branch_id)])];
  const claims = {
    sub: row.id,
    email: row.email,
    role,
    ...(role === 'CLIENT_ADMIN' ? { clientId: row.client_id } : {}),
    ...(role === 'BRANCH_MANAGER' ? { branchIds } : {}),
  };
  const token = await signStaffJwt(env.JWT_SECRET!, claims);
  return { token, staff: { id: row.id, email: row.email, role, clientId: row.client_id, branchIds } };
}

/**
 * POST /api/auth/staff { email, password } → { token, staff }
 * Staff (Platform Admin / Client / Manager) session as a 12h HS256 JWT.
 * Same 401 for unknown email and wrong password.
 */
auth.post('/staff', async (c) => {
  if (!c.env.JWT_SECRET) return c.json(apiError('Auth not configured', 'AUTH_NOT_CONFIGURED'), 500);
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return c.json(apiError('email and password required', 'INVALID_BODY'), 400);
  const row = await c.env.DB.prepare(
    `SELECT id, email, role, client_id, branch_id, password_hash FROM staff_users WHERE lower(email) = ?1`,
  )
    .bind(email)
    .first<StaffRow>();
  const ok = row ? await verifyPassword(password, row.password_hash) : await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
  if (!row || !ok || !STAFF_ROLES.includes(row.role as StaffRole)) {
    return c.json(apiError('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS'), 401);
  }
  return c.json(await staffSession(c.env, row));
});

/**
 * POST /api/auth/staff/dev { email } — dev-only staff login without a password
 * (mirrors /api/auth/dev for guests). 404 unless ENVIRONMENT === 'dev'.
 */
auth.post('/staff/dev', async (c) => {
  if (c.env.ENVIRONMENT !== 'dev') return c.json(apiError('Not found', 'NOT_FOUND'), 404);
  if (!c.env.JWT_SECRET) return c.json(apiError('JWT_SECRET missing', 'DEV_MISCONFIGURED'), 500);
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'admin@luotdi.vn';
  const row = await c.env.DB.prepare(
    `SELECT id, email, role, client_id, branch_id, password_hash FROM staff_users WHERE lower(email) = ?1`,
  )
    .bind(email)
    .first<StaffRow>();
  if (!row) return c.json(apiError('Unknown dev staff', 'NOT_FOUND'), 404);
  return c.json(await staffSession(c.env, row));
});

/** GET /api/auth/staff/me — who the current staff session is. */
auth.get('/staff/me', async (c) => {
  const r = await resolveActor(c.req.raw.headers, c.env);
  if (!r.ok) return c.json(apiError('Staff authentication required', r.code), 401);
  return c.json({ actor: r.actor });
});

export { auth };
