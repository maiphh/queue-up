---
name: zmp-queue-up
description: >
  Product-specific playbook for shipping the LượtĐi guest app (apps/zalo-mini-app) as a
  Zalo Mini App against the Cloudflare Worker + D1 backend (apps/api-worker). Covers
  wiring zmp-sdk/zmp-ui into the existing React 19 / Vite 6 / react-router 7 app, Zalo
  login → D1 identity + JWT, phone/location token decode, per-branch QR deep links,
  "your turn" notifications (OA UID / ZNS + fallback), Worker CORS/secrets, live queue
  updates, testing/CI, privacy and review. Use with the generic `zmp` skill.
---

# LượtĐi on Zalo Mini App

Generic platform knowledge lives in [`../zmp/SKILL.md`](../zmp/SKILL.md) and its
`references/`. This skill only adds what is specific to this repo. Do not duplicate it.

Legend: ✅ verified against docs.zaloplatforms.com (Oct 2026) · ⚠️ unverified — confirm in
console/docs before relying on it.

## Current repo state (read before editing)

| Area | Today | Problem inside Zalo |
|------|-------|---------------------|
| `apps/zalo-mini-app/src/App.tsx` | `BrowserRouter` without basename | App is served under a Zalo path; routes won't match ✅ (ZMPRouter docs: BrowserRouter needs correct `basename`) |
| `hooks/useZaloIdentity.ts` | probes `window.zmp`, falls back to **localStorage** UUID | `zmp-sdk` is not installed; LocalStorage/SessionStorage/Cookie are **not supported** in Mini Apps ✅ |
| `routes/tickets.ts` | trusts `zaloUserId` from request body | Anyone can impersonate a guest — must come from verified JWT |
| `hooks/useQueueSocket.ts` | `wss://${window.location.host}/api/...` | Host is Zalo's (h5.zdn.vn), not the Worker; needs `VITE_API_BASE` |
| `vite.config.ts` | dev proxy `/api` → :8787 | Proxy doesn't exist in Zalo builds; use absolute HTTPS API URL |
| `services/zns-dispatcher.ts` | wallet debit + idempotent ledger, `ZnsSender` optional | No real sender, no OA/ZNS fallback, no phone on ticket by default |
| `app-config.json` | title + colors only | Fine to start; see `../zmp/references/app-config.md` |

Product rules (actors, copy, queue engine) stay in `AGENTS.md`, `docs/product/*`, `plan.md` §4–5.

## Order of work

1. **Integrate SDK + routing** → [references/integration.md](references/integration.md)
2. **Auth: Zalo token → Worker → D1 guest + JWT** → [references/auth-identity.md](references/auth-identity.md)
3. **Worker CORS, secrets, domains** → [references/worker-checklist.md](references/worker-checklist.md)
4. **Per-branch QR / deep links, scanQRCode, share** → [references/entry-and-sharing.md](references/entry-and-sharing.md)
5. **Live queue updates + "your turn" notifications** → [references/notifications-and-live.md](references/notifications-and-live.md)
6. **Tests, CI deploy, i18n** → [references/testing-ci-i18n.md](references/testing-ci-i18n.md)
7. **Privacy + review submission** → [references/review-checklist.md](references/review-checklist.md)

## Non-negotiables

- Never trust a client-sent Zalo user id. Identity = verified `getAccessToken()` → Worker → Graph API → JWT.
- Secrets (`ZALO_APP_SECRET`, OA access token, ZNS creds, JWT key) only via `wrangler secret put`.
- Phone/location tokens are one-shot and expire in **2 minutes** ✅ — decode immediately server-side.
- Ask for phone only when needed (e.g. opting into ZNS), with a clear reason — unclear permission flows get rejected ✅.
- No localStorage/cookies in the guest app; use `zmp-sdk` native storage (`setItem`/`getItem`) (see `../zmp/references/permissions-and-apis.md`) and `Authorization: Bearer` headers ✅.
- Guest-facing copy is Vietnamese-first via `@luotdi/shared` copy (`guestCopy`).
