# Phase 1 Gate Verification Report

**Project:** LượtĐi (QueueVN)  
**Agent:** AGENT-QA  
**Date:** 2026-10-14  
**Scope:** Phase 1 — Core Queue Domain Engine & Atomic D1 Layer

---

## Tests Passed

| Check | Result |
| :--- | :--- |
| `pnpm lint` | PASS (5/5 packages) |
| `pnpm typecheck` | PASS (5/5 packages) |
| `pnpm --filter @luotdi/shared test` | PASS — 31 tests |
| `pnpm --filter api-worker test` | PASS — 20 tests (4 files) |

**api-worker suites:** `d1-smoke.test.ts` (3), `cron.spec.ts` (3), `tickets.spec.ts` (4), `host-actions.spec.ts` (10).

Note: Vitest/miniflare emitted Windows `EBUSY` temp-dir cleanup warnings after the run; they did not affect pass/fail.

---

## SQL / Concurrency Verified

### Atomic ticket issuance

- `POST /api/tickets` uses `db.batch()` with:
  1. `UPDATE queue_buckets SET current_seq = current_seq + 1 … RETURNING current_seq, …`
  2. `INSERT INTO tickets … SELECT … qb.current_seq … FROM queue_buckets qb`
  3. Merchant `monthly_ticket_count` increment
- File: [`apps/api-worker/src/routes/tickets.ts`](../../apps/api-worker/src/routes/tickets.ts) (approx. lines 197–241)
- No application-level `SELECT MAX(seq) + 1` for ticket numbers (repo-wide grep clean except plan docs / comment explaining the avoidance).

### 25-concurrent race test

- Spec: [`apps/api-worker/test/tickets.spec.ts`](../../apps/api-worker/test/tickets.spec.ts) — `issues 25 concurrent 2-pax tickets as unique A·001..A·025 with no lock errors`
- Asserts HTTP 200 for all 25, unique `displayNumber`s `A·001`…`A·025`, sequential `seqNumber` 1…25
- **Observed:** passed (~388ms)

### CHANGE_BUCKET seniority

- Implementation updates only `bucket_id` / `pax_count`; does not touch `created_at` or `display_number`  
  ([`apps/api-worker/src/services/host-queue.ts`](../../apps/api-worker/src/services/host-queue.ts) ~283–289)
- Spec asserts preserved `display_number` and `created_at` after move A→B

### EMA outlier clamps

- Seat path: EMA applied only when `actualWaitMins >= 2 && actualWaitMins <= 180`  
  (`host-queue.ts` ~176–194; formula `0.7 * rolling + 0.3 * actual`)
- Specs: in-range update; ignore `<2m`; ignore `>180m`

### Cron schedule

- `wrangler.toml`: `crons = ["0 21 * * *"]` (04:00 Asia/Ho_Chi_Minh / UTC+7)
- `scheduled()` / cron service comments align; not UTC midnight

---

## Anti-Patterns Checked

| # | Anti-pattern (plan.md §5) | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | `SELECT MAX(seq) + 1` for ticket numbers | **CLEAR** | Atomic `UPDATE … RETURNING` + batch insert |
| 2 | Unbounded client polling on D1 | N/A Phase 1 UI | DO binding present; Phase 2 owns live fan-out |
| 3 | Forcing `getPhoneNumber` on Zalo launch | N/A Phase 1 backend | — |
| 4 | Resetting `created_at` on re-bucket | **CLEAR** | CHANGE_BUCKET preserves `created_at` + `display_number` |
| 5 | Unbounded host action buttons | N/A Phase 1 UI | — |
| 6 | UTC midnight daily reset | **CLEAR** | Cron `0 21 * * *` |

Checklist extras from gate brief:

- **State machine ↔ `VALID_TRANSITIONS`:** Matches plan §4 (`WAITING→CALLED|CANCELLED`, `CALLED→SEATED|HELD|CANCELLED`, `HELD→CALLED|SEATED|CANCELLED`, terminals empty). Host + cron call `transitionTicket()` from `@luotdi/shared`. Shared suite covers every edge + illegal paths (31 tests).
- **EMA clamps `<2` / `>180`:** Implemented and tested.
- **UI slop (emoji / rounded):** Skipped per Phase 1 backend scope.

---

## Issues Found

None critical.

| Severity | Item | File | Notes |
| :--- | :--- | :--- | :--- |
| Low (deferred) | Production JWT for host routes not wired | `apps/api-worker/src/routes/host.ts` | Intentional stub via `X-Test-Staff-Role`; comment states JWT lands later. Acceptable for Phase 1 gate. |
| Low (by design) | `BUMP_PRIORITY` uses `MAX(priority_boost)+1` | `host-queue.ts` | Specified in plan §4.5; not the seq-issuance anti-pattern. Concurrent bump race is theoretical and out of gate scope. |

---

## Gate Decision: **PASS**

Phase 1 exit criteria are met. Lint, typecheck, shared unit tests, and api-worker integration tests are green. Atomic issuance, concurrent uniqueness, CHANGE_BUCKET seniority, EMA clamps, cron timezone, and state-machine contract are verified.

**AGENT-BACKEND:** No blocking fixes required. Proceed to Phase 2 when scheduled (Durable Objects + ZNS wallet ledger). Do not treat this report as starting Phase 2 implementation.
