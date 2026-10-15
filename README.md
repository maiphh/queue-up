# LượtĐi (QueueVN)

Vietnam B2B2C virtual queue. A guest takes a number on Zalo. A client watches their brands and branches. A manager runs one site, and an admin onboards clients.

Roles, scope, and URLs: [AGENTS.md](AGENTS.md) and [docs/product/actors.md](docs/product/actors.md). `/` on the staff app is a dev door, not the product home.

## Stack

- **Guest:** Zalo Mini App (React + Vite + Braun)
- **Staff:** PWA on Cloudflare Pages (Admin, Client, Manager, TV)
- **API:** Cloudflare Workers (Hono + D1 + Durable Objects)

## Commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
```

### Local API + mock data

The Zalo Mini App and staff PWA call `/api/*` on their Vite origin. Vite proxies those requests to the worker at `http://127.0.0.1:8787`. You need **both** the worker and the UI running, with D1 seeded.

```bash
# Apply schema + seed into local D1 (first time or full reset)
# If EPERM: stop wrangler/workerd first, or use db:seed only
pnpm --filter api-worker db:reset

# Re-seed only (keeps schema; clears/reinserts mock rows) — safe while worker is stopped
pnpm --filter api-worker db:seed

# Terminal 1 — worker
pnpm --filter api-worker dev

# Terminal 2 — staff app (http://127.0.0.1:5173)
pnpm --filter merchant-web dev

# Terminal 3 — Zalo mini app (http://127.0.0.1:5174)
pnpm --filter zalo-mini-app dev
```

Dev identity is a header, not a password. Personas and the actor switch: [docs/agent/personas.md](docs/agent/personas.md).

### Actors

| Actor | URL | Email |
| :--- | :--- | :--- |
| Admin | http://127.0.0.1:5173/admin | `admin@luotdi.vn` |
| Client | http://127.0.0.1:5173/client | `client@antam.vn` (Nhóm An Tâm), `client@cafetrung.vn` (Cafe Trung) |
| Manager | http://127.0.0.1:5173/manage/branch-pho-d1 | `manager@pho-nh.vn` |
| TV | http://127.0.0.1:5173/tv/branch/branch-pho-d1 | branch floor |
| Guest | http://127.0.0.1:5174/b/qr-pho-nguyen-hue | Khách |

### Seeded ids

Ids below that already load with `db:reset` stay. `client-an-tam`, `client-cafe`, `branch-pho-d3`, and `qr-pho-q3` are the role-pass seed in [docs/product/actors.md](docs/product/actors.md). This phase does not change seed SQL.

| Entity | ID / token |
| :--- | :--- |
| Client Nhóm An Tâm | `client-an-tam` — Phở 24 and Phòng Khám An Tâm |
| Client Cafe Trung | `client-cafe` — Cafe Trung only |
| Phở 24 Nguyễn Huệ | `branch-pho-d1` / `qr-pho-nguyen-hue` |
| Phở 24 second district | `branch-pho-d3` / `qr-pho-q3` |
| Cafe branch | `branch-cafe-d3` / `qr-cafe-d3` |
| Clinic branch | `branch-clinic-tb` / `qr-clinic-tb` |

The current mock set includes merchants (PRO restaurant, FREE cafe, PRO clinic), buckets, live WAITING/CALLED tickets, staff users, and a sample wallet ledger.

## Zalo Mini App deployment

### Guest app env (`apps/zalo-mini-app/.env`, see `.env.example`)

| Var | Purpose |
|-----|---------|
| `VITE_API_BASE` | Absolute Worker origin (e.g. `https://api.luotdi.vn`). Required for Zalo builds — the app runs on `https://h5.zdn.vn`, so relative `/api` calls would hit Zalo. Empty in `pnpm dev` (Vite proxy). Fetch + WebSocket URLs both derive from it. |

### Worker secrets (`wrangler secret put <NAME>`; locally in `apps/api-worker/.dev.vars`)

| Name | Purpose |
|------|---------|
| `ZALO_APP_SECRET` | Zalo App secret; `appsecret_proof` for `graph.zalo.me/v2.0/me` |
| `JWT_SECRET` | HS256 key for guest session JWTs (≥ 32 random bytes) |
| `ZALO_OA_ACCESS_TOKEN` | OA access token for ZNS (`business.openapi.zalo.me/message/template`). Expires — rotate. |
| `ZNS_TEMPLATE_APPROACHING_ID` | Approved ZNS template id for "approaching turn" (params: `ticket_number`, `parties_ahead`, `branch_name`) |
| `ZNS_DEVELOPMENT_MODE` | Optional, `1` sends ZNS with `mode: "development"` |

Vars: `ENVIRONMENT` (`wrangler.toml` ships `production`, so `POST /api/auth/dev` returns 404 when deployed; local `.dev.vars` sets `dev`), `CORS_EXTRA_ORIGINS` (comma list, e.g. the `zmp start` preview URL). CORS always allows `https://h5.zdn.vn`.

D1 migrations: `wrangler d1 migrations apply luotdi-db --remote` — `0001` guest_users, `0002` per-branch `branches.slug` (TV `/tv/:branchSlug`), `0003` branch settings (ZNS threshold, hours/auto-pause, shortcuts, TV voice/chime/mascot/static). `0004` `branches.paused_at` (Admin “Cần chú ý”). `0005` `branches.lat/lng` (Mini App distance).

Auth flow: `getAccessToken()` → `POST /api/auth/zalo { accessToken }` → `{ token }` → `Authorization: Bearer <token>` on `POST /api/tickets`. The ticket's `zalo_user_id` comes only from the JWT.

## Local dev (Windows / macOS / Linux)

```powershell
corepack enable
pnpm install
pnpm dev
```

On first run, `pnpm dev` creates `apps/api-worker/.dev.vars` from `.dev.vars.example` (`ENVIRONMENT=dev`, dev-only `JWT_SECRET`) and creates and seeds the local D1. Everything is plain Node, so no POSIX shell is needed.

- Worker: http://localhost:8787 · Mini App: http://localhost:5173 · Merchant web: http://localhost:5174
- Opened in a normal browser (not Zalo), the Mini App logs in through `POST /api/auth/dev` automatically. Use `http://localhost:5173/?as=lan` to be guest "lan"; another name gives another guest.
- Merchant web has no login in dev, so it needs no bypass.
- Check: `curl.exe -X POST http://localhost:8787/api/auth/dev -H "Content-Type: application/json" -d "{}"` → 200 with a token.
- Got a 404 on `/api/auth/dev`? Either `.dev.vars` lacks `ENVIRONMENT=dev` (delete it and rerun `pnpm dev`), or `VITE_API_BASE` in `apps/zalo-mini-app/.env*` points at production. Leave it empty for dev.
- Reset data: `pnpm --filter api-worker db:reset` (stop `pnpm dev` first on Windows).

## Workspace

- `apps/api-worker` — Cloudflare Worker API
- `apps/zalo-mini-app` — Guest mini app
- `apps/merchant-web` — Admin, Client, Manager, and TV
- `packages/shared` — Zod schemas, state machine, copy
- `packages/ui-braun` — Braun design tokens + anti-slop ESLint
