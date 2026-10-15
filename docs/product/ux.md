# UX

Braun stays: chassis, hairline grid, ink header, orange primary keycap, mono tabular ticket numbers, no emoji, no shadow, radius ≤ 2px except LED dots.

The page h1 is the place or the account name (Plus Jakarta). The role is a short eyebrow, not the title.

One primary keycap per region. Text is a short Vietnamese verb, at most three words.

GridCell 10px mono labels are indexes only. The human sentence sits in the cell body.

Empty, loading, and error states are one Vietnamese sentence. No pnpm, curl, or stack traces in the UI.

Touch targets are min-h 48px.

Failed actions must show an error. No empty catch blocks that hide failure.

Restaurant nouns: khách, số khách. Clinic and hospital nouns: bệnh nhân, dịch vụ. Same buttons, same API.

API action enums stay `SUMMON`, `HOLD`, `SEAT`, `BUMP_PRIORITY`, `CHANGE_BUCKET`, `CANCEL`. Only labels change.

## Merchant app (:5173)

| Route | What it is |
| :--- | :--- |
| `/` | Dev door with three choices: Admin, Client, Quản lý. Not a product home. |
| `/admin` | Platform dashboard and onboard. Replaces `/super-admin`. |
| `/client` | Brands and branches. Replaces old `/admin`. |
| `/client/branches/:branchId` | Bucket, QR standee, wallet. |
| `/manage/:branchId` | Floor actions. Replaces `/host/:branchId`. |
| `/tv/branch/:branchId` | TV for that branch. |
| `/tv/:merchantSlug` | Fallback only. |

Redirects:

- `/super-admin` → `/admin`
- `/host/:branchId` → `/manage/:branchId`
- old owner `/admin/:branchId` → `/client/branches/:branchId`

Do both meanings of `/admin` in one shell change so they never coexist. Old `/admin` was the client account. New `/admin` is the platform operator. Do not ship a build where both meanings are live.

## Guest app (:5174)

Keep `/`, `/b/:qrToken`, and `/ticket/:ticketId`. Copy only. Do not add staff roles.

## Dev actor switch

The dev actor switch is merchant chrome. Hide it on `/tv/branch/:branchId`. `sessionStorage` key: `luotdi.devActor`.

## UI phase requirements

These are defects the UI phases must fix. Do not treat this file as the implementation.

- The walk-in dialog must `POST /api/tickets` with source `HOST_MANUAL`.
- TV must not use merchant slug `LIMIT 1` once a brand has two branches.
- The super admin page must not say GOD MODE.
- Merchant home must not say Local demo console, and must not show HOST POS, OWNER ADMIN, or SUPER ADMIN as the primary labels.
