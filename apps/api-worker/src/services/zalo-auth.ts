import { hmacSha256Hex } from './jwt';

/**
 * `id` only. Since 2024-02-29 Zalo returns name, avatar, and phone solely to
 * Vietnam IPs. Cloudflare egress is outside Vietnam, so requesting those
 * fields fails the whole call with "Personal information is limited…".
 */
export const ZALO_GRAPH_ME_URL = 'https://graph.zalo.me/v2.0/me?fields=id';

export type ZaloProfile = { id: string; name?: string; avatarUrl?: string };

export type ZaloProfileResult =
  | { ok: true; profile: ZaloProfile }
  | { ok: false; zaloError: number | null; zaloMessage: string };

type GraphMe = {
  id?: string | number;
  name?: string;
  picture?: { data?: { url?: string } };
  error?: number | string;
  message?: string;
};

/** wrangler secret put on Windows often keeps a trailing newline. Zalo then rejects every proof. */
function cleanSecret(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

/**
 * Exchange a Mini App `getAccessToken()` token for the Zalo profile.
 * Sends `appsecret_proof = HMAC_SHA256(accessToken, ZALO_APP_SECRET)` (hex).
 */
export async function fetchZaloProfile(
  accessToken: string,
  appSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZaloProfileResult> {
  const token = cleanSecret(accessToken);
  const secret = cleanSecret(appSecret);
  if (!token || !secret) {
    return { ok: false, zaloError: null, zaloMessage: 'empty token or secret' };
  }
  const res = await fetchImpl(ZALO_GRAPH_ME_URL, {
    headers: {
      access_token: token,
      appsecret_proof: await hmacSha256Hex(secret, token),
    },
  });
  let me: GraphMe;
  try {
    me = (await res.json()) as GraphMe;
  } catch {
    return { ok: false, zaloError: res.status, zaloMessage: `graph HTTP ${res.status}` };
  }
  const code =
    me.error === undefined || me.error === null || me.error === '' ? null : Number(me.error);
  const id = me.id === undefined || me.id === null ? '' : String(me.id);
  // An id is enough to sign in. A non-zero code here is Zalo withholding
  // name/avatar from a non-Vietnam IP, not a rejected token.
  if (id) {
    return {
      ok: true,
      profile: {
        id,
        ...(me.name ? { name: me.name } : {}),
        ...(me.picture?.data?.url ? { avatarUrl: me.picture.data.url } : {}),
      },
    };
  }
  const zaloMessage =
    typeof me.message === 'string' && me.message.trim()
      ? me.message.trim().slice(0, 200)
      : `graph HTTP ${res.status}`;
  return {
    ok: false,
    zaloError: code !== null && Number.isFinite(code) ? code : res.status,
    zaloMessage,
  };
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
