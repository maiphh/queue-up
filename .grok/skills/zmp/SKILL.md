---
name: zmp
description: >
  Build, maintain, and publish Zalo Mini Apps with zmp-cli and the VS Code Extension:
  init/start/deploy, app-config.json, zmp-sdk/zmp-ui, permissions, review/publish, and
  troubleshooting. Also covers Checkout SDK, OpenAPIs, and OA messaging when needed.
  Use when the user runs /zmp, or asks about Zalo Mini App, zmp-cli, zmp-sdk, ZaUI,
  Mini App deploy, review, or publish.
---

# Zalo Mini App (ZMP)

Official docs (Vietnamese source of truth): https://docs.zaloplatforms.com/docs/MA  
Index: https://docs.zaloplatforms.com/MA/llms.txt  
Samples: https://github.com/Zalo-MiniApp  
Console: https://mini.zalo.me/developers  
Zalo for Developers: https://developers.zalo.me/

When details are needed, open the matching page under `references/` or fetch the linked official doc. Prefer live docs over outdated memory.

## Stack

- Web app (HTML/CSS/JS or React) running inside Zalo WebView
- Packages: `zmp-sdk` (bridge APIs), `zmp-ui` / ZaUI (UI kit)
- Config: root `app-config.json`
- Tooling: `zmp-cli` (`npm i -g zmp-cli`) or VS Code **Zalo Mini App Extension**
- IDs: **Zalo App ID** (platform app) is not **Mini App ID** (one Mini App inside that Zalo App)

## Lifecycle (do in order)

1. Create/activate a Zalo App on developers.zalo.me
2. Create a Mini App in Mini App Center → get Mini App ID
3. Scaffold or convert project; link Mini App ID
4. Request permissions needed for non-admin users
5. Develop + preview (Simulator / Chrome Debugger / Device)
6. Deploy **Development** for real-Zalo smoke tests
7. Complete verification/KYB before review
8. Deploy **Testing** → submit for review → **Publish** approved version
9. Maintain: iterate Testing deploys, permissions, webhooks, payments, OA/ZNS

Details: [references/lifecycle.md](references/lifecycle.md)

## CLI / Extension cheatsheet

```sh
npm i -g zmp-cli
zmp --help
zmp login                 # QR or access token
zmp init                  # new project or convert existing web app
zmp start                 # local browser preview
zmp start -D              # Device mode (QR → real Zalo); Vite 2.x required
zmp deploy                # Development (default) or Testing
```

Extension mirrors the same flows (init / start / deploy) inside VS Code.

Deploy types:

| Type | Behavior |
|------|----------|
| Development | Overwritten each deploy; not listed as numbered versions; for quick Zalo testing |
| Testing | Versioned in Version Management; can be submitted for review → Publish |

Quotas (common hard limit): Development ~300/month, Testing ~60/month. Bundle: app ≤ 10MB, single file ≤ 3MB.

## Project conventions

- Root `app-config.json` with required `app.title`. See [references/app-config.md](references/app-config.md).
- Prefer ZaUI: `App` → `ZMPRouter` → `AnimationRoutes` / pages with `Page`, `Box`, `Text`, `Button`.
- Import static assets so Vite bundles them (`import coffee from "..."`). Bare `/public/...` paths break on production.
- Call business APIs over **HTTPS** only. CORS origin for production Mini App: `https://h5.zdn.vn` (and localhost for local preview). Reflect a **single** origin; handle OPTIONS.
- Never put app secrets, payment keys, or OpenAPI keys in the Mini App client. Decode phone/location tokens, OpenAPIs, and Checkout server APIs on **your backend**.
- Real Zalo APIs (`getAccessToken`, `getPhoneNumber`, Checkout, share, OA) need Device mode or a deployed Development/Testing build inside Zalo — Simulator alone is UI-only.

## Auth & permissions

Login pattern:

1. Client: `getAccessToken()` from `zmp-sdk`
2. Backend: `GET https://graph.zalo.me/v2.0/me` with headers `access_token` + `appsecret_proof` (HMAC-SHA256 of token with Zalo App secret)
3. Upsert user by Zalo profile `id` (unique per Zalo App ID)

Phone: use `getPhoneNumber` in context (checkout, membership), with onboarding copy if required at entry.

Permissions: request in Mini App Center (Quản lý quyền). Admins/developers can use restricted APIs during development; end users fail without approved permissions. See [references/permissions-and-apis.md](references/permissions-and-apis.md).

## Publish checklist

- Verification/KYB completed
- Permissions approved for APIs you call
- Testing version deployed with clear changelog description
- Review criteria: consistent name/logo/description, correct category, no unapproved third-party redirects, no fake/share-bait, no unapproved ads/virtual goods, stable performance, Zalo auth, privacy
- After **Approved** → Publish from Version Management
- Live debug: deep link `?zDebug=true` or Android USB remote debugging

## Payments / OpenAPI / OA (when asked)

- Payments must use **Checkout SDK** (`CheckoutSDK.createOrder`, listen `PaymentDone`, `checkTransaction`; confirm on server webhook). See [references/checkout-sdk.md](references/checkout-sdk.md).
- Server OpenAPIs (stats, webhooks, partner create/deploy/publish, KYB): [references/openapi.md](references/openapi.md).
- Notify users via linked OA (UID message / ZNS) or Journey Message APIs — never from the client with secrets.

## Troubleshooting first stops

Read [references/troubleshooting.md](references/troubleshooting.md) for CORS, empty API data in Simulator, Dev-only vs Live permission errors, size/quota limits, CI/CD token mismatches, ES2015 target, Tailwind Device mode, PDF viewing.

Community: https://mini.zalo.me/community

## Doc map

Full section → URL map: [references/docs-map.md](references/docs-map.md)
