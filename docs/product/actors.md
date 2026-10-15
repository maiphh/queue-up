# Actors

Admin → Client account → Brand (`merchants`) → Branch → Manager on that branch. A guest takes a number at a branch.

A brand is today's `merchants` row. Do not rename that table. One client owns one or more brands. Each brand has branches. `HOSPITAL` is a valid `industry_type` and uses `SERVICE_TYPE` routing, the same as `CLINIC`. The seeded clinic is the hospital/clinic proof. Do not add a fourth brand.

Production JWT is deferred. Dev identity is a header, not a login form.

## Wording

| Who | UI name | Code role | What they see | Forbidden names |
| :--- | :--- | :--- | :--- | :--- |
| Platform operator | Admin | `PLATFORM_ADMIN` | Every client, brand, and branch | Super-Admin, God Mode, Owner |
| Paying business account | Client | `CLIENT_ADMIN` | Brands where `merchants.client_id` is their client, and those branches | Do not call the person waiting in line a Client |
| Person at one desk | Quản lý | `BRANCH_MANAGER` | Assigned branches only. Page title is the branch name. | Host, Host POS |
| Person waiting on Zalo | Khách | none | Their ticket at one branch | Client |

The person waiting is a Guest. The paying business is the Client. The desk is the Manager. The platform operator is the Admin.

## Scope

- `PLATFORM_ADMIN` sees every client, brand, and branch. Can onboard and change plan. Can open a branch floor with a banner.
- `CLIENT_ADMIN` sees only brands where `merchants.client_id` is their client. 403 on another client. Can edit buckets, view wallet, print QR. Cannot onboard a new client. Cannot force-clear another client.
- `BRANCH_MANAGER` acts only on assigned branches. 403 on other branches. Cannot change plan tier. Cannot onboard a client.
- Guest routes need no staff header: `POST /api/tickets`, `GET /api/branches`, ticket read, TV read, webhooks.
- Staff routes without a recognized actor return 401. Wrong scope returns 403.

## Dev headers

- `X-Dev-Actor`: `PLATFORM_ADMIN` | `CLIENT_ADMIN` | `BRANCH_MANAGER`
- `X-Dev-Client-Id`
- `X-Dev-Branch-Id` (comma-separated if several)
- `X-Test-Staff-Role` is also accepted

Legacy headers stay accepted for one release and map to the new roles. Product labels must not say Host or Owner.

| Legacy value | Maps to |
| :--- | :--- |
| `BRANCH_HOST` | `BRANCH_MANAGER` |
| `MERCHANT_OWNER` | `CLIENT_ADMIN` |
| `SUPER_ADMIN` | `PLATFORM_ADMIN` |

## Seed later phases must implement

Document only. Do not treat this section as applied SQL.

- `client-an-tam` "Nhóm An Tâm" owns `merchant-pho24` (Phở 24, `RESTAURANT`) and `merchant-clinic` (Phòng Khám An Tâm, `CLINIC`).
- `branch-pho-d1` Nguyễn Huệ, and new `branch-pho-d3` (second district, `PARTY_SIZE`, QR token `qr-pho-q3`).
- `branch-clinic-tb` stays `SERVICE_TYPE`.
- `client-cafe` "Cafe Trung" owns only `merchant-cafe` and `branch-cafe-d3`.

| Email | Role | Scope |
| :--- | :--- | :--- |
| `admin@luotdi.vn` | `PLATFORM_ADMIN` | Every site |
| `client@antam.vn` | `CLIENT_ADMIN` | `client-an-tam` |
| `client@cafetrung.vn` | `CLIENT_ADMIN` | `client-cafe` |
| `manager@pho-nh.vn` | `BRANCH_MANAGER` | `branch-pho-d1` |
| `manager@pho-q3.vn` | `BRANCH_MANAGER` | `branch-pho-d3` |
| `manager@clinic.vn` | `BRANCH_MANAGER` | `branch-clinic-tb` |
| `manager@cafe.vn` | `BRANCH_MANAGER` | `branch-cafe-d3` |

`owner@pho24.vn` is not a product role. Do not show Owner in the UI.

`client@antam.vn` must not see Cafe Trung. `manager@pho-nh.vn` gets 403 on the clinic.
