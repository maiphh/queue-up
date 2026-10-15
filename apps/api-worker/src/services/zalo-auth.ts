import { hmacSha256Hex } from './jwt';

export const ZALO_GRAPH_ME_URL = 'https://graph.zalo.me/v2.0/me?fields=id,name,picture';

export type ZaloProfile = { id: string; name?: string; avatarUrl?: string };

type GraphMe = {
  id?: string;
  name?: string;
  picture?: { data?: { url?: string } };
  error?: number;
  message?: string;
};

/**
 * Exchange a Mini App `getAccessToken()` token for the Zalo profile.
 * Sends `appsecret_proof = HMAC_SHA256(accessToken, ZALO_APP_SECRET)` (hex).
 * Returns null on any Graph error.
 */
export async function fetchZaloProfile(
  accessToken: string,
  appSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZaloProfile | null> {
  const res = await fetchImpl(ZALO_GRAPH_ME_URL, {
    headers: {
      access_token: accessToken,
      appsecret_proof: await hmacSha256Hex(appSecret, accessToken),
    },
  });
  if (!res.ok) return null;
  const me = (await res.json()) as GraphMe;
  if (!me.id || (me.error !== undefined && me.error !== 0)) return null;
  return { id: me.id, name: me.name, avatarUrl: me.picture?.data?.url };
}

/** Upsert by zalo_user_id; returns guest_users.id. */
export async function upsertGuestUser(
  db: D1Database,
  profile: ZaloProfile,
  nowMs = Date.now(),
): Promise<string> {
  const row = await db
    .prepare(
      `INSERT INTO guest_users (id, zalo_user_id, display_name, avatar_url, created_at, last_interaction_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(zalo_user_id) DO UPDATE SET
         display_name = COALESCE(excluded.display_name, guest_users.display_name),
         avatar_url = COALESCE(excluded.avatar_url, guest_users.avatar_url),
         last_interaction_at = excluded.last_interaction_at,
         deleted_at = NULL
       RETURNING id`,
    )
    .bind(
      crypto.randomUUID(),
      profile.id,
      profile.name ?? null,
      profile.avatarUrl ?? null,
      nowMs,
    )
    .first<{ id: string }>();
  if (!row) throw new Error('guest upsert failed');
  return row.id;
}
