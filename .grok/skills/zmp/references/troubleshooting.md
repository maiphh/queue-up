# Common Mini App issues

Source: https://docs.zaloplatforms.com/docs/MA/intro/getting-started/frequently-solved-issues

## Network / CORS

Symptom: works in Postman/localhost, fails in Mini App.

Fix on **server**:

- Allow origin `https://h5.zdn.vn` (production) and your localhost origin for preview
- Reflect **one** origin only (never comma-separated list)
- Handle `OPTIONS` preflight with the same CORS headers
- Use `https://` only (no raw IP, no http) — Secure Context

See also: `/docs/MA/intro/best-practices/call-restful-api`

## Secrets called from the client

Decode phone/location, OpenAPI, Checkout server APIs (`getOrderStatus`, `updateOrderStatus`), send-notification — all need secrets. Move to **your backend**.

## Empty Zalo API data while developing

Simulator/browser preview is UI-only. Use **Device mode** (`zmp start -D` / Extension Device) or a **Development** deploy inside Zalo for `getAccessToken`, Checkout, share, OA, etc.

## Images missing in production

Import assets so Vite bundles them. Do not rely on bare `/file.jpg` public paths.

## Minified React error #N

Open the URL inside the error message for the full React warning; fix hooks/render rules.

## Permission works for admin, fails for users

Request the API permission in Mini App Center (and during version review step 1). Applies to phone, location, media picker, camera, keepScreen, native storage, etc.

## "Page not found / invalid" on Dev/Testing

Opener is not Admin/Developer of the Mini App. Use an admin account or the Live version.

## "App still in development"

No Live version published yet.

## Not in Mini App Store / search

Ops may disable search (e.g. traditional username/password login for internal apps). Fix login flow, resubmit Testing version, ask to re-enable search in review notes.

## Deploy limits

- ~300 Development / 30 days
- ~60 Testing / 30 days
- App ≤ 10MB; file ≤ 3MB → CDN for media; code-split JS

## CI/CD login failures

- `ZALO_APP_SECRET` + `ZALO_REFRESH_TOKEN` must match the same `ZALO_APP_ID`
- Do not swap Mini App ID with Zalo App ID
- Avoid env var `ZMP_TOKEN` colliding with `.env`

Guide: https://mini.zalo.me/blog/setup-ci-cd-for-mini-app/

## ES2015 transform errors

Default build target is ES2015. Raise Vite target (weaker old-device support) or replace the incompatible library (prefer ZaUI / fetch over heavy UI kits / axios when possible).

## Live debugging

- Deep link: `https://zalo.me/s/<MINI_APP_ID>/?zDebug=true`
- Android USB + Chrome remote debugging

## Device mode extras

- Tailwind not updating: upgrade Vite to `^2.9`, reload VS Code window
- Direct device connect needs `adb` on PATH
- Device mode requires valid Mini App ID + recent SDK + Vite 2.x (not Webpack)

## PDF

Prefer in-app `react-pdf@5.x`. `openWebview` PDF behavior differs by Android/iOS and `Content-Disposition`. Prefer `openDocument` for PDF URLs when appropriate.

## Vite plugin mismatch

Replace `@vitejs/plugin-react-refresh` with `@vitejs/plugin-react` in `vite.config`.

## Still stuck

Update zmp-sdk, zmp-ui, CLI/Extension, and Zalo app → search https://mini.zalo.me/community
