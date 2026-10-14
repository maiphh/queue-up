# Phase 4 Gate Verification Report

**Project:** LượtĐi (QueueVN)  
**Agent:** AGENT-QA  
**Date:** 2026-10-14  
**Scope:** Phase 4 — Merchant PWA — Host POS, Smart TV & Admin

---

## Tests Passed

| Check | Result |
| :--- | :--- |
| `pnpm test` (root) | PASS — 5/5 packages (`@luotdi/shared` 31, `@luotdi/ui-braun` 20, `api-worker` 35, `merchant-web` 20, `zalo-mini-app` 6) |
| `pnpm typecheck` (root) | PASS — 5/5 packages |
| `pnpm lint` (root) | PASS — 5/5 packages |
| `pnpm --filter merchant-web test` | PASS — 20 tests (4 files) |

**merchant-web suites:** `host-pos.spec.tsx` (6), `tv-kiosk.spec.tsx` (4), `owner-admin.spec.tsx` (6), `super-admin.spec.tsx` (4).

Note: Vitest/miniflare emitted Windows `EBUSY` temp-dir cleanup warnings and an `IoContext` inactivity notice after the DO suite; they did not affect pass/fail.

---

## Phase 4 Criteria Verified

### Step 4.1 — Tactical Host POS (`/host/:branch_id`)

| Requirement | Status | Evidence |
| :--- | :--- | :--- |
| Top bar: `WAITING`, `AVG WAIT`, `QUEUE STATUS` + `PAUSE QUEUE` + `+ WALK-IN` | **PASS** | `host-pos.spec.tsx` top-bar suite; [`HostPosPage.tsx`](../../apps/merchant-web/src/modules/host-pos/HostPosPage.tsx) |
| Pinned Summoned Strip only when `>=1` `CALLED`; `SEAT GUEST` + `HOLD 10M` | **PASS** | Spec asserts strip hidden with no CALLED; appears with both actions |
| Waiting ledger: single primary `SUMMON` per row | **PASS** | Spec + implementation: one `KeycapButton` `SUMMON` per waiting row |
| Secondary actions in MORE drawer (`Bump Priority`, `Change Party Size`, `Cancel`) | **PASS** | Progressive disclosure confirmed (see below) |

### Progressive disclosure (anti-pattern #5)

- Waiting rows expose **only** `SUMMON` (primary) + `MORE` (secondary trigger).
- `SEAT GUEST` / `HOLD 10M` / `Cancel` are **not** primary row actions on WAITING rows.
- `Bump Priority`, `Change Party Size`, `Cancel` live inside `data-testid="row-action-drawer"` opened by `MORE`.
- Spec: [`host-pos.spec.tsx`](../../apps/merchant-web/src/__tests__/host-pos.spec.tsx) — “shows a single primary SUMMON…” and “keeps Bump Priority… inside MORE…”.
- Implementation: [`HostPosPage.tsx`](../../apps/merchant-web/src/modules/host-pos/HostPosPage.tsx) lines ~276–334 (`SUMMON` / `MORE` / drawer).

### Step 4.2 — Smart TV 16:9 (`/tv/:branch_slug`)

| Requirement | Status | Evidence |
| :--- | :--- | :--- |
| Left 50%: `NOW SUMMONING` flash on `YOUR_TURN_CALLED` | **PASS** | `tv-kiosk.spec.tsx` |
| `speechSynthesis` `lang = 'vi-VN'` for summoned ticket | **PASS** | Spec asserts Vietnamese TTS invocation |
| Right 50%: bucket summary `BÀN A/B/C` without emoji | **PASS** | Spec + anti-slop grep |
| High-contrast static walk-in QR | **PASS** | Spec |
| Wake-lock (`navigator.wakeLock`) | **PASS** | Implemented on TV kiosk view |

### Step 4.3 — Owner Admin & Super-Admin

| Requirement | Status | Evidence |
| :--- | :--- | :--- |
| Dynamic bucket editor (A–F prefixes, min/max pax, counters) | **PASS** | `owner-admin.spec.tsx` |
| VietQR top-up: memo `LUOTDI <MERCHANT_SLUG>` | **PASS** | Owner admin VietQR suite |
| Printable QR standee region | **PASS** | Owner admin print suite |
| Super-Admin: impersonate branch → host | **PASS** | `super-admin.spec.tsx` |
| Override `plan_tier` FREE ↔ PRO | **PASS** | Spec |
| Force-clear stuck WAITING/CALLED/HELD | **PASS** | Spec |

---

## UI Anti-Slop Audit

Grep scope: `apps/merchant-web/src`.

| Pattern | Matches | Status |
| :--- | :--- | :--- |
| Unicode emoji / pictographs in UI source | 0 (only “no emoji” comments in specs) | **CLEAR** |
| `rounded-lg` / `rounded-xl` / `rounded-full` (also `2xl`/`3xl`) | 0 | **CLEAR** |
| `shadow-md` / `shadow-lg` (also `xl`/`2xl`) | 0 | **CLEAR** |

Enforcement: root ESLint `braun/no-slop-ui` + `@luotdi/ui-braun` Tailwind preset; merchant-web lint green.

---

## Anti-Patterns Checked

| # | Anti-pattern (plan.md §5) | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | `SELECT MAX(seq) + 1` for ticket numbers | **CLEAR** | Only explanatory comment in `tickets.ts`; issuance still atomic `UPDATE … RETURNING` |
| 2 | Unbounded client polling on D1 | **CLEAR** | Live path uses DO WebSockets (`useQueueSocket`); no `setInterval` poll loops in merchant-web |
| 3 | Forcing `getPhoneNumber` on Zalo launch | **CLEAR** | Owned by Phase 3; unchanged |
| 4 | Resetting `created_at` on re-bucket | **CLEAR** | Unchanged from Phase 1/2 |
| 5 | Unbounded host action buttons | **CLEAR** | SUMMON primary + MORE drawer; SEAT/HOLD on summoned strip only |
| 6 | UTC midnight daily reset | **CLEAR** | Cron `0 21 * * *` unchanged |

---

## Issues Found

None critical.

| Severity | Item | File | Notes |
| :--- | :--- | :--- | :--- |
| Low (tooling) | Miniflare Windows `EBUSY` temp cleanup | api-worker vitest | Does not fail suites |
| Low (deferred) | Production JWT for host routes | `routes/host.ts` | Still test-header stub from Phase 1; acceptable for UI gate |

---

## Gate Decision: **PASS**

Phase 4 exit criteria are met. Root `pnpm test` / `typecheck` / `lint` are green. Merchant Host POS progressive disclosure (`SUMMON` + `MORE` drawer), TV summoning + vi-VN TTS, Owner Admin VietQR/buckets, and Super-Admin god mode specs all pass. Merchant-web anti-slop grep is clean (zero emoji / banned radius / shadow). Anti-pattern #5 (unbounded host buttons) is cleared.

**AGENT-FRONTEND / AGENT-BACKEND:** No blocking fixes required. Monorepo Phase 0–4 implementation gate may proceed to final verification summary.
