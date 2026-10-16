import { Hono } from 'hono';
import type { Env } from '../index';
import { readGuestBearer } from '../services/jwt';
import { sanitizeAvatarUrl, sanitizeDisplayName } from '../services/zalo-auth';

const me = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

/**
 * POST /api/me/display { displayName?, avatarUrl? } → { name, avatarUrl }
 *
 * Cloudflare egress is outside Vietnam, so graph.zalo.me cannot return the
 * display name/avatar. The Mini App — running inside Zalo — reads them with
 * `getUserInfo()` and sends them here as a best-effort label.
 *
 * The guest JWT is the only identity: only the `sub` row is updated, any body
 * id is ignored, and `zalo_user_id` is never touched. Omitted fields are left
 * alone (a blank client label must not wipe a stored one).
 */
me.post('/display', async (c) => {
  const bearer = await readGuestBearer(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (bearer.kind !== 'ok') {
    return c.json(apiError('Sign in required', 'UNAUTHORIZED'), 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON body', 'INVALID_BODY'), 400);
  }

  const raw = (body ?? {}) as { displayName?: unknown; avatarUrl?: unknown };
  const displayName = sanitizeDisplayName(raw.displayName);
  const avatarUrl = sanitizeAvatarUrl(raw.avatarUrl);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (displayName !== null) {
    sets.push('display_name = ?');
    binds.push(displayName);
  }
  if (avatarUrl !== null) {
    sets.push('avatar_url = ?');
    binds.push(avatarUrl);
  }

  const sql =
    sets.length === 0
      ? `SELECT display_name, avatar_url FROM guest_users WHERE id = ?`
      : `UPDATE guest_users SET ${sets.join(', ')} WHERE id = ? RETURNING display_name, avatar_url`;

  const row = await c.env.DB.prepare(sql)
    .bind(...binds, bearer.claims.sub)
    .first<{ display_name: string | null; avatar_url: string | null }>();
  if (!row) {
    return c.json(apiError('Guest not found', 'GUEST_NOT_FOUND'), 404);
  }
  return c.json({ name: row.display_name ?? null, avatarUrl: row.avatar_url ?? null });
});

export { me };
