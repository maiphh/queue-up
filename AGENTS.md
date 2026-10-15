# LượtĐi

LượtĐi is a Vietnam B2B2C virtual queue. A guest takes a number on Zalo. A client watches their brands and branches. A manager runs one site, and an admin onboards clients.

## Actors

- **Admin** (`PLATFORM_ADMIN`) — onboard paying clients and watch every site.
- **Client** (`CLIENT_ADMIN`) — configure the brands and branches that account owns. They do not call the next number.
- **Manager** (`BRANCH_MANAGER`) — call, seat, hold, pause, and add a walk-in at assigned branches only. UI eyebrow: Quản lý.
- **Guest** (no staff role) — Khách on the Zalo mini app. Takes a number. Never a Client.

## Directory map

- `apps/api-worker` — Cloudflare Worker API
- `apps/merchant-web` — staff app, http://127.0.0.1:5173
- `apps/zalo-mini-app` — guest app, http://127.0.0.1:5174
- `packages/shared` — schemas, state machine, copy
- `packages/ui-braun` — Braun tokens and primitives

## Commands

```bash
pnpm install
pnpm --filter api-worker db:reset
pnpm --filter api-worker dev
pnpm --filter merchant-web dev
pnpm --filter zalo-mini-app dev
pnpm test
pnpm typecheck
pnpm lint
```

Run the three dev processes in separate terminals after `db:reset`.

## Current work

Phases 0–4 of plan.md are implemented. Do not restart Phase 0 of that blueprint. Current work is the role and usability pass. Read `docs/product/actors.md`, `docs/product/ux.md`, and `docs/agent/personas.md` before editing screens or roles.

The queue engine (atomic seq, state machine, anti-patterns) is [plan.md](plan.md) sections 4 and 5. Do not copy those sections into new docs or rescaffold the engine.
