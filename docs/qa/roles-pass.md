# Roles and usability pass

Reviewed after the Grok 4.5 worker phases. Queue engine (atomic seq, state machine, Durable Object, ZNS, cron) was not reopened.

## Words

| Person | UI | Code | Result |
| :--- | :--- | :--- | :--- |
| Platform operator | Admin | `PLATFORM_ADMIN` | `/admin` onboard + client tree. No God Mode label. |
| Paying account | Client | `CLIENT_ADMIN` | `/client` lists brands and branches. An Tâm does not include Cafe Trung (`actor-scope.spec.ts`). |
| Desk | Quản lý | `BRANCH_MANAGER` | `/manage/:branchId`. One `Gọi` plus `Thêm`. Walk-in POSTs `HOST_MANUAL`. |
| Person in line | Khách | none | Mini app: `Lấy số`, `Mời vào quầy`. |

`merchants` stays the brand table. `clients` sits above it. Legacy headers `BRANCH_HOST`, `MERCHANT_OWNER`, and `SUPER_ADMIN` still map for one release.

## Commands

| Command | Result |
| :--- | :--- |
| `pnpm test` | Pass. shared 31, ui-braun 20, zalo 6, merchant-web 29, api-worker 38 + 2 durable-object. |
| `pnpm typecheck` | Pass. |
| `pnpm lint` | Failed once on an unused `BraunChassis` import in `HomePage.tsx`. Import removed. `pnpm --filter merchant-web lint` then exited 0. |

Windows Miniflare printed `EBUSY` while deleting temp directories after the api-worker suite. The test process still exited 0. Same note as the earlier phase gates.

## Not verified in a browser

No browser tool is connected in this session. Button flows are covered by Testing Library (onboard POST, portfolio brands, walk-in POST, guest `Lấy số`, TV by branch id). A live click-through on `:5173` and `:5174` was not done. Local D1 needs `pnpm --filter api-worker db:reset` before the new clients and `branch-pho-d3` exist in the dev database.

## Still deferred

Production JWT. Clinic and hospital nouns on the floor appear only when a snapshot includes `industryType` (`CLINIC` or `HOSPITAL`). The current snapshot route does not send that field, so the floor uses restaurant wording.
