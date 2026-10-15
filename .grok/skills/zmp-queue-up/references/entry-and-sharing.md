# Per-branch QR / deep links, scanQRCode, sharing

## Link format ✅

```
https://zalo.me/s/{MINI_APP_ID}/?branch={qrToken}
https://zalo.me/s/{MINI_APP_ID}/?ticket={ticketId}
```

Use the existing `branches.qr_code_token` (already unique) — never the internal branch id.
Printed table/door QR = QR image of the first link. Generate in merchant-web (client
"branch settings" screen) with any QR lib; include `&src=door|table|poster` for analytics.

Partner OpenAPI can create QR short links ✅ (exists); not needed for an independent app.

## Reading params on launch

```ts
import { getRouteParams } from 'zmp-sdk';
export function resolveInitialRoute(): string {
  const p = getRouteParams();            // Record<string,string> ✅
  if (p.ticket) return `/ticket/${p.ticket}`;
  if (p.branch) return `/b/${p.branch}`;
  return '/';
}
```

⚠️ Behaviour when the app is already open in background and the user scans a second QR:
listen to `events.on(EventName.OpenApp, …)` (event exists per `../../zmp` API map) and navigate;
payload shape unverified — log it in a Development build first.

Ticket links must still require the JWT owner to match (or show a read-only "pass" view).

## In-app scanner ✅

```ts
import { scanQRCode } from 'zmp-sdk';
const { content } = await scanQRCode({});
const token = new URL(content).searchParams.get('branch'); // validate host = zalo.me & our app id
```

Needs the camera/QR permission approved for non-admins. Put the button on `MarketplacePage`.

## Share ticket / branch ✅

```ts
import { openShareSheet } from 'zmp-sdk';
await openShareSheet({ type: 'link', data: { link: `https://zalo.me/s/${APP_ID}/?branch=${qrToken}`, chatOnly: false } });
// or type: 'text' with autoParseLink: true
```

Review rule: no share-bait / forced sharing ✅ (see `../../zmp/references/lifecycle.md`). Share
is optional, user-initiated only (e.g. "Gửi cho bạn đi cùng").
