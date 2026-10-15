# Zalo login → Worker → D1 guest + JWT

## Flow

1. Mini App: `const accessToken = await getAccessToken();` (needs real Zalo: Device mode or a deployed build).
2. Optional profile consent: `getUserInfo({ autoRequestPermission: true })` for name/avatar; handle deny (`-1401`, see `../../zmp/references/permissions-and-apis.md`).
3. `POST {API}/api/auth/zalo` body `{ accessToken }`.
4. Worker: `GET https://graph.zalo.me/v2.0/me?fields=id,name,picture` with headers
   `access_token` and `appsecret_proof = HMAC_SHA256(accessToken, ZALO_APP_SECRET)` (hex).
   ✅ pattern from authen-user best practice (as captured in `../zmp`).
5. Upsert `guest_users` by `zalo_user_id` (Zalo `id` is unique per **Zalo App ID** ✅, shared across Mini Apps of the same Zalo App).
6. Return a short-lived JWT (e.g. 7 days, HS256 via WebCrypto, key = `JWT_SECRET`). Client sends `Authorization: Bearer <jwt>` ✅ (docs recommend JWT + header, no cookies).
7. `tickets.ts` reads `zalo_user_id` from the JWT. Remove `req.zaloUserId` from the body schema.

## Worker sketch (Hono)

```ts
async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

auth.post('/zalo', async (c) => {
  const { accessToken } = await c.req.json<{ accessToken: string }>();
  const res = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
    headers: { access_token: accessToken,
      appsecret_proof: await hmacHex(c.env.ZALO_APP_SECRET, accessToken) },
  });
  const me = await res.json<{ id?: string; name?: string; error?: number }>();
  if (!me.id) return c.json({ error: 'ZALO_AUTH_FAILED' }, 401);
  // upsert guest_users, sign JWT { sub: guest.id, zid: me.id }
});
```

Do not persist the Zalo access token beyond the request unless you need phone/location decode
in the same flow (it is needed there — see below).

## D1 schema sketch (add to `apps/api-worker/src/db/schema.sql`)

```sql
CREATE TABLE guest_users (
  id TEXT PRIMARY KEY,
  zalo_user_id TEXT UNIQUE NOT NULL,      -- Graph `id` (per Zalo App)
  zalo_oa_uid TEXT,                       -- getUserInfo().idByOA, only after followOA
  display_name TEXT,
  avatar_url TEXT,
  phone_e164 TEXT,                        -- only if user opted in (ZNS); encrypt at rest
  notify_opt_in INTEGER NOT NULL DEFAULT 0,
  oa_followed_at INTEGER,
  last_interaction_at INTEGER,            -- for OA messaging window
  created_at INTEGER NOT NULL,
  deleted_at INTEGER                      -- set on user.revoke.consent
);
```

`tickets.zalo_user_id` stays as the join key (already indexed). Existing columns
`customer_phone_masked` / `customer_phone_encrypted` are reused for per-ticket phone.

## Phone / location token decode ✅

Client: `const { token } = await getPhoneNumber();` (or `getLocation()`), send immediately with
the current access token. Token is single-use and expires after **2 minutes**.

Worker:

```ts
const r = await fetch('https://graph.zalo.me/v2.0/me/info', {
  headers: { access_token: userAccessToken, code: token, secret_key: c.env.ZALO_APP_SECRET },
});
// phone:    { data: { number: "849123456789" }, error: 0 }
// location: { data: { provider, latitude, longitude, timestamp }, error: 0 }
```

Normalize `84…` → E.164 `+84…`; store masked + encrypted. Location: use only to sort
`MarketplacePage` by distance; don't store it.

Both need permissions approved in Mini App Center for non-admin users (`../../zmp/references/permissions-and-apis.md`).
