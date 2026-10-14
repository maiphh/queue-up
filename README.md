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

## Workspace

- `apps/api-worker` — Cloudflare Worker API
- `apps/zalo-mini-app` — Customer Mini App
- `apps/merchant-web` — Merchant / Host PWA
- `packages/shared` — Zod schemas, state machine, constants
- `packages/ui-braun` — Braun design tokens + anti-slop ESLint
