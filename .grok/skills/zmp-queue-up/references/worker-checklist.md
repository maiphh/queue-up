# Cloudflare Worker checklist for Zalo

## CORS (Hono)

```ts
import { cors } from 'hono/cors';
const ALLOWED = ['https://h5.zdn.vn', 'http://localhost:3000', 'http://127.0.0.1:5174'];
app.use('/api/*', cors({
  origin: (o) => (ALLOWED.includes(o) ? o : null), // reflect ONE origin
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}));
```

- `https://h5.zdn.vn` is the documented production origin ✅. Local preview port of `zmp start` ⚠️ (check terminal output).
- Must be HTTPS on a real domain (no IP, no http) ✅.
- Hono's `cors` handles OPTIONS preflight. Keep `app.all('*')` 501 **after** the middleware.
- WebSocket upgrade (`/api/branches/:id/ws`) is not subject to CORS but check `Origin` yourself.
- ⚠️ Confirm WebSockets to third-party domains work inside the Zalo WebView on iOS + Android in a Development deploy before relying on them (see `notifications-and-live.md` fallback).

## Secrets (`wrangler secret put <NAME>`; never in `wrangler.toml` or the client)

| Name | Use |
|------|-----|
| `ZALO_APP_SECRET` | appsecret_proof, phone/location decode |
| `JWT_SECRET` | guest JWT signing |
| `ZALO_OA_ACCESS_TOKEN` / `ZALO_OA_REFRESH_TOKEN` | OA UID messages + ZNS (OA tokens expire; store refreshed token in D1/KV ⚠️ lifetime) |
| `ZNS_TEMPLATE_APPROACHING_ID`, `ZNS_TEMPLATE_CALLED_ID` | template ids (not secret but env-specific) |
| `MINIAPP_WEBHOOK_SECRET` | verify `X-ZEvent-Signature` ✅ header name |

Add them to `Env` in `src/index.ts`. Use `.dev.vars` locally (git-ignored).
Also replace the placeholder `database_id` in `wrangler.toml` for real envs; use
`[env.staging]` / `[env.production]`.

## Domain whitelist / console

- Mini App Center: register the API domain the Mini App calls ⚠️ (exact menu name not verified;
  Partner OpenAPI has "Cấu hình API Domain" ✅ so the concept exists).
- developers.zalo.me: Zalo App must be activated; Mini App linked to the business OA for OA/ZNS.
- Webhook URL (Mini App Center) → `POST /api/webhooks/zalo-miniapp` (see `review-checklist.md`).
