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

## Workspace

- `apps/api-worker` — Cloudflare Worker API
- `apps/zalo-mini-app` — Guest mini app
- `apps/merchant-web` — Admin, Client, Manager, and TV
- `packages/shared` — Zod schemas, state machine, copy
- `packages/ui-braun` — Braun design tokens + anti-slop ESLint
