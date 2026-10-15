# Mini App Open APIs (server)

Source: https://docs.zaloplatforms.com/docs/MA/openApis/intro

Call from **your backend** with API keys. Two audiences:

| Audience | Capabilities |
|----------|--------------|
| Independent developer / business | API key from Mini App; webhooks (basic events); stats |
| Solution partner | Partner API key; create/manage many apps; deploy/review/publish automation; full webhooks; KYB; permissions APIs |

Java SDK artifact (docs sample): `zalo-miniapp-openapi-sdk` 2.4.0 — `OpenAPIClient` / `PartnerClient`.

## Independent Open API

- Setup client: `/docs/MA/openApis/open/apis/setUpClient`
- Stats: `/docs/MA/openApis/open/apis/stats`
- Webhook URL + signature verify
- Event: user revoke consent / delete data — you must honor deletion

## Partner Open API

Typical automation:

1. `listCategories` → `createMiniApp`
2. `updateAppCategory` (set `subCateIds` before KYB)
3. KYB: list permits → submit owner docs → upload business file → submit business docs → poll status
4. `deployMiniApp` → `requestPublishMiniApp` → `publishMiniApp`
5. Optional: QR short link, API domain config, payment channel, `appPermission`

Webhooks: review status, consent revoke — verify signature.

## Notifications

`/docs/MA/openApis/notification/apis/send`

- Via business OA (UID message after `followOA` + `idByOA`) or ZNS
- Journey Message program: `/docs/MA/journeyMessage/intro`

## eKYC

Separate server APIs under `/docs/MA/eKYC/` (session, image upload, OCR, face match, fraud checks). Encryption, credentials, IP whitelist, signatures required.

## Errors

https://docs.zaloplatforms.com/docs/MA/openApis/errorCode
