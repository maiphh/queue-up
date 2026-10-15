# Lifecycle: create → build → verify → publish → maintain

Source: https://docs.zaloplatforms.com/docs/MA/intro/getting-started

## 1. Create Mini App

1. Register/activate a **Zalo App** at https://developers.zalo.me/
2. Open https://mini.zalo.me/developers → select Zalo App → **Create Mini App**
3. Save the **Mini App ID** (required to link the local project and to deploy)

Changing core Mini App metadata after creation may require a support ticket.

## 2. Build

Options:

- Hire a solution partner (https://miniforbusiness.zalo.me/)
- Self-build with Extension or CLI

Self-build path:

1. Request permissions: `/docs/MA/intro/request-permission`
2. Scaffold: Extension init or `zmp init` (blank Vite JS/TS templates, or convert existing web app)
3. Wire `zmp-sdk` APIs: `/docs/MA/api/intro`
4. Payments if needed: Checkout SDK `/docs/MA/checkoutSdk/intro`
5. UI/UX: Design Guidelines + ZaUI `/docs/MA/zaui/overview/intro`
6. Preview: Simulator / Chrome Debugger for UI; Device mode or Development deploy for real Zalo APIs

Convert existing web app: `/docs/MA/intro/getting-started/convert-web-app-to-mini-app`

## 3. Verify (KYB)

Required before publish. Does not block development.

- Owner + business documents via Mini App Center or Partner OpenAPI KYB
- Set business category (`subCateIds`) before submitting docs
- Guide: Mini App verification agreement on miniapp.zaloplatforms.com

## 4. Publish

Source: `/docs/MA/intro/public-mini-program`

1. Deploy a **Testing** version (`zmp deploy` or Extension Deploy panel)
2. In Mini App Center → Version Management → submit Testing version for review
3. Status → Waiting for review → Approved / Rejected
4. On Approved → **Publish** to users

Review summary (see full agreement for legal detail):

- Name, logo, description match features; lawful; no IP abuse
- Features match registered category
- No unapproved third-party redirects
- No share/download bait for non–Mini App installs
- No fraud/impersonation; no unapproved ads/monetization
- No virtual goods trading facilitation
- Stable (no crash), good performance/load, solid UI/UX
- Privacy/security; Zalo Authentication for identity

## 5. Maintain

- Iterate with Development deploys for smoke tests; Testing for reviewable releases
- Keep permissions in sync with APIs you call
- Watch deploy quotas and bundle size
- Server webhooks: payment callbacks, consent revoke / user data delete
- Optional: OA/ZNS / Journey Message for re-engagement
- Analytics via OpenAPI stats
