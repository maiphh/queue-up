# Personas

The dev actor switch selects the persona. There is no password.

## Boot

```bash
pnpm --filter api-worker db:reset
pnpm --filter api-worker dev
pnpm --filter merchant-web dev
pnpm --filter zalo-mini-app dev
```

Reset first. Then run the worker, merchant-web, and the Zalo mini app in three terminals.

## Primary

| Persona | URL | Email |
| :--- | :--- | :--- |
| Admin | http://127.0.0.1:5173/admin | admin@luotdi.vn |
| Client | http://127.0.0.1:5173/client | client@antam.vn and client@cafetrung.vn |
| Manager | http://127.0.0.1:5173/manage/branch-pho-d1 | manager@pho-nh.vn |
| TV | http://127.0.0.1:5173/tv/branch/branch-pho-d1 | none |
| Guest | http://127.0.0.1:5174/b/qr-pho-nguyen-hue | none |

`client@antam.vn` is Client of Nhóm An Tâm. `client@cafetrung.vn` is Client of Cafe Trung. Same `/client` URL; the dev client id selects the account.

## Other branches

| Branch | Manager email | Floor | TV | Guest |
| :--- | :--- | :--- | :--- | :--- |
| `branch-pho-d3` | manager@pho-q3.vn | http://127.0.0.1:5173/manage/branch-pho-d3 | http://127.0.0.1:5173/tv/branch/branch-pho-d3 | http://127.0.0.1:5174/b/qr-pho-q3 |
| `branch-clinic-tb` | manager@clinic.vn | http://127.0.0.1:5173/manage/branch-clinic-tb | http://127.0.0.1:5173/tv/branch/branch-clinic-tb | http://127.0.0.1:5174/b/qr-clinic-tb |
| `branch-cafe-d3` | manager@cafe.vn | http://127.0.0.1:5173/manage/branch-cafe-d3 | http://127.0.0.1:5173/tv/branch/branch-cafe-d3 | http://127.0.0.1:5174/b/qr-cafe-d3 |

`owner@pho24.vn` is not a persona. Do not show Owner.
