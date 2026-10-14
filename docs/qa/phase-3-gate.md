# Phase 3 Gate Verification Report

**Project:** LượtĐi (QueueVN)  
**Agent:** AGENT-QA  
**Date:** 2026-10-14  
**Scope:** Phase 3 — Customer Zalo Mini App — Braun Hardware UI

---

## Tests Passed

| Check | Result |
| :--- | :--- |
| `pnpm --filter zalo-mini-app test` | PASS — 6 tests (1 file) |
| `pnpm --filter @luotdi/ui-braun test` | PASS — 20 tests (1 file) |
| `pnpm --filter zalo-mini-app lint` | PASS |
| `pnpm --filter @luotdi/ui-braun lint` | PASS |
| `pnpm --filter zalo-mini-app typecheck` | PASS |
| `pnpm --filter @luotdi/ui-braun typecheck` | PASS |

**zalo-mini-app suites:** `customer-flow.spec.tsx` (6) — QR deep-link check-in, 1-tap issue pass, live pass metrics, `YOUR_TURN_CALLED` chassis flip, marketplace list, category filters.

**ui-braun suites:** `primitives.test.tsx` (20) — BraunChassis, GridCell, KeycapButton (3 variants + click + snapshot), SegmentedMatrix, LedIndicator (3 states + snapshot), TabularMetric (3 sizes + snapshot).

---

## Phase 3 Criteria Verified

### Step 3.1 — Braun UI primitives (`packages/ui-braun`)

| Primitive | Spec requirement | Status |
| :--- | :--- | :--- |
| `BraunChassis` | `#E6E5E0` surface + `1px solid #C8C6BE` frame | **PASS** — `bg-chassis` / `border-grid` / `rounded-none` |
| `GridCell` | Uppercase `10px` JetBrains Mono index header | **PASS** — `font-mono text-[10px] uppercase` |
| `KeycapButton` | `primary \| secondary \| danger` + `border-b-2` press | **PASS** — variants + tactile border |
| `SegmentedMatrix` | 1–8+ with `-ml-[1px]` collapsed borders | **PASS** — 8 radios, collapsed borders |
| `LedIndicator` | `active \| warning \| idle`, crisp `6px` | **PASS** — `h-[6px] w-[6px] rounded-led` |
| `TabularMetric` | `display \| lg \| md`, tabular mono | **PASS** — `font-mono tabular` |

Exports and tokens live in [`packages/ui-braun/src/index.ts`](../../packages/ui-braun/src/index.ts). Preset zeros banned radii/shadows ([`tailwind.preset.js`](../../packages/ui-braun/tailwind.preset.js)).

### Step 3.2 — Customer screens (`apps/zalo-mini-app`)

1. **QR Deep-Link (`/b/:qr_token`):** Branch header, `01 / SELECT PARTY SIZE` matrix (1–8+), auto-matched bucket A/B/C + wait estimate — covered by spec; implemented in [`BranchCheckInPage.tsx`](../../apps/zalo-mini-app/src/pages/BranchCheckInPage.tsx).
2. **1-Tap Issue Pass:** `ISSUE QUEUE PASS` → `POST /api/tickets` → `/ticket/:id` — covered by spec.
3. **Live Pass (`/ticket/:id`):** Giant `A·014` readout, 3-cell strip (`NOW SERVING` / `AHEAD OF YOU` / `EST. WAIT`), `YOUR_TURN_CALLED` flips chassis to `bg-signal-orange` + `PROCEED TO HOST STAND` — covered by spec; WebSocket via [`useQueueSocket`](../../apps/zalo-mini-app/src/hooks/useQueueSocket.ts).
4. **Marketplace (`/`):** Nearby branches with waiting counts; filters `ALL` / `RESTAURANT` / `CLINIC` / `CAFE` — covered by spec.

### Identity & live path

- [`useZaloIdentity`](../../apps/zalo-mini-app/src/hooks/useZaloIdentity.ts): uses `getUserInfo` (non-sensitive) when ZMP bridge present; falls back to deterministic local-dev UUID. **No `getPhoneNumber` on launch.**
- Live updates use Durable Object WebSocket (`HELLO` as `CUSTOMER`); **no `setInterval` / D1 polling loops** in mini-app src.

---

## UI Anti-Slop Audit

Grep scope: `apps/zalo-mini-app/src` and `packages/ui-braun/src`.

| Pattern | Matches | Status |
| :--- | :--- | :--- |
| Unicode emoji / pictographs | 0 | **CLEAR** |
| `rounded-lg` / `rounded-xl` / `rounded-full` (also `md`/`2xl`/`3xl`) | 0 | **CLEAR** |
| `shadow-md` / `shadow-lg` (also `sm`/`xl`/`2xl` / bare `shadow`) | 0 | **CLEAR** |

Enforcement:

- ESLint `braun/no-slop-ui` on all `**/*.{tsx,jsx}` ([`.eslintrc.cjs`](../../.eslintrc.cjs)) — lint green for both packages.
- Tailwind preset overrides `borderRadius` and `boxShadow` to `0` / `none` except hardware `rounded-led` / `rounded-led-sq`.
- Allowed LED exception: `LedIndicator` uses `rounded-led` (6px circle) only.

---

## Anti-Patterns Checked

| # | Anti-pattern (plan.md §5) | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | `SELECT MAX(seq) + 1` for ticket numbers | N/A Phase 3 frontend | Backend Phase 1/2 |
| 2 | Unbounded client polling on D1 | **CLEAR** | WebSocket `useQueueSocket`; no poll loops in mini-app |
| 3 | Forcing `getPhoneNumber` on Zalo launch | **CLEAR** | `getUserInfo` + local UUID fallback only |
| 4 | Resetting `created_at` on re-bucket | N/A Phase 3 frontend | — |
| 5 | Unbounded host action buttons | N/A Phase 3 (Host POS = Phase 4) | — |
| 6 | UTC midnight daily reset | N/A Phase 3 frontend | — |

Checklist extras from gate brief:

- **Zero UI violations:** emoji / large radius / drop shadow — clear under grep + ESLint.
- **Six Braun primitives + snapshots:** present and green.
- **Customer flow RED specs green:** all four screen flows covered (6 tests).

---

## Issues Found

None critical.

| Severity | Item | File | Notes |
| :--- | :--- | :--- | :--- |
| Low (by design) | Marketplace / branch APIs mocked in Vitest | `customer-flow.spec.tsx` | Acceptable for Phase 3 UI gate; live API contract owned by worker. |
| Low (deferred) | Phone / OA opt-in toggle on Live Pass | `LivePassPage.tsx` | Plan allows optional opt-in later; not required to force phone on launch. |

---

## Gate Decision: **PASS**

Phase 3 exit criteria are met. `zalo-mini-app` and `@luotdi/ui-braun` tests, lint, and typecheck are green. All six Braun hardware primitives are snapshot-tested. Customer QR check-in, 1-tap pass issue, live pass + `YOUR_TURN_CALLED` orange chassis, and marketplace filters pass. UI anti-slop grep is clean (zero emoji / banned radius / shadow). `getPhoneNumber` is not forced on launch; live path uses WebSockets rather than D1 polling.

**AGENT-FRONTEND:** No blocking fixes required. Proceed to Phase 4 when scheduled (Merchant PWA — Host POS, Smart TV & Admin). Do not treat this report as starting Phase 4 implementation.
