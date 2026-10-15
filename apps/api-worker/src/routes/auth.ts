import { Hono } from 'hono';
import type { Env } from '../index';
import { signGuestJwt } from '../services/jwt';
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

  let profile;
  try {
    profile = await fetchZaloProfile(body.accessToken, c.env.ZALO_APP_SECRET);
  } catch {
    profile = null;
  }
  if (!profile) {
    return c.json(apiError('Zalo token rejected', 'ZALO_AUTH_FAILED'), 401);
  }

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
 * POST /api/auth/dev { devUserId } — browser-only dev login.
 * Enabled only when ENVIRONMENT === 'dev'; 404 everywhere else.
 */
auth.post('/dev', async (c) => {
  if (c.env.ENVIRONMENT !== 'dev' || !c.env.JWT_SECRET) {
    return c.json(apiError('Not found', 'NOT_FOUND'), 404);
  }
  const body = (await c.req.json().catch(() => ({}))) as { devUserId?: unknown };
  const devId =
    typeof body.devUserId === 'string' && body.devUserId ? body.devUserId : 'dev-guest';
  const profile = { id: `dev:${devId}`, name: 'Dev Guest' };
  const guestId = await upsertGuestUser(c.env.DB, profile);
  const token = await signGuestJwt(c.env.JWT_SECRET, {
    sub: guestId,
    zid: profile.id,
    name: profile.name,
  });
  return c.json({ token, guest: { id: guestId, name: profile.name, avatarUrl: null } });
});

export { auth };
