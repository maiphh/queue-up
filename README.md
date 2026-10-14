# LượtĐi (QueueVN)

Vietnam B2B2C virtual queueing platform.

## Stack

- **Customer:** Zalo Mini App (React + Vite + Braun)
- **Merchant:** PWA on Cloudflare Pages
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

The Zalo Mini App and Merchant PWA call `/api/*` on their Vite origin. Vite proxies those requests to the worker at `http://127.0.0.1:8787`. You need **both** the worker and the UI running, with D1 seeded.

```bash
# Apply schema + seed into local D1 (first time or full reset)
# If EPERM: stop wrangler/workerd first, or use db:seed only
pnpm --filter api-worker db:reset

# Re-seed only (keeps schema; clears/reinserts mock rows) — safe while worker is stopped
pnpm --filter api-worker db:seed

# Terminal 1 — worker
pnpm --filter api-worker dev

# Terminal 2 — merchant PWA (http://127.0.0.1:5173)
pnpm --filter merchant-web dev

# Terminal 3 — Zalo mini app (http://127.0.0.1:5174)
pnpm --filter zalo-mini-app dev
```

**Seeded demo IDs**

| Entity | ID / token |
| :--- | :--- |
| Phở 24 branch | `branch-pho-d1` |
| QR deep-link | `qr-pho-nguyen-hue` |
| Cafe branch | `branch-cafe-d3` / `qr-cafe-d3` |
| Clinic branch | `branch-clinic-tb` / `qr-clinic-tb` |
| Host POS | `/host/branch-pho-d1` |
| TV kiosk | `/tv/pho-24` (slug = merchant slug) |

Mock set includes merchants (PRO restaurant, FREE cafe, PRO clinic), buckets, live WAITING/CALLED tickets, staff users, and a sample wallet ledger.

## Workspace

- `apps/api-worker` — Cloudflare Worker API
- `apps/zalo-mini-app` — Customer Mini App
- `apps/merchant-web` — Merchant / Host PWA
- `packages/shared` — Zod schemas, state machine, constants
- `packages/ui-braun` — Braun design tokens + anti-slop ESLint
