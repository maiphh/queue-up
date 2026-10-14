# Phase 2 Gate Verification Report

**Project:** LượtĐi (QueueVN)  
**Agent:** AGENT-QA  
**Date:** 2026-10-14  
**Scope:** Phase 2 — Real-Time Durable Objects & ZNS Wallet Ledger

---

## Tests Passed

| Check | Result |
| :--- | :--- |
| `pnpm lint` | PASS (5/5 packages) |
| `pnpm typecheck` | PASS (5/5 packages) |
| `pnpm --filter @luotdi/shared test` | PASS — 31 tests |
| `pnpm --filter api-worker test` | PASS — 27 tests (6 files) |

**api-worker suites:** `d1-smoke.test.ts` (3), `cron.spec.ts` (3), `zns-wallet.spec.ts` (5), `tickets.spec.ts` (4), `host-actions.spec.ts` (10), `durable-object.spec.ts` (2 via `vitest.do.config.ts`).

Note: Vitest/miniflare emitted Windows `EBUSY` temp-dir cleanup warnings and an `IoContext` inactivity notice after the DO suite; they did not affect pass/fail.

---

## Phase 2 Criteria Verified

### DO hibernation (`acceptWebSocket`)

- [`apps/api-worker/src/do/BranchQueueRoom.ts`](../../apps/api-worker/src/do/BranchQueueRoom.ts) upgrades with `WebSocketPair` + `this.state.acceptWebSocket(server)` (hibernation API).
- Hibernation handlers present: `webSocketMessage`, `webSocketClose`; fan-out via `this.state.getWebSockets()` + `serializeAttachment` / `deserializeAttachment`.
- Route: `GET /api/branches/:branchId/ws` → DO stub ([`routes/branches.ts`](../../apps/api-worker/src/routes/branches.ts)).
- Host `SUMMON` posts `/broadcast` after status update ([`host-queue.ts`](../../apps/api-worker/src/services/host-queue.ts) `notifyBranchRoom`).
- Spec: [`durable-object.spec.ts`](../../apps/api-worker/test/durable-object.spec.ts) — Host+TV+Customer receive `QUEUE_UPDATED`; Customer receives `YOUR_TURN_CALLED`. Suite notes hibernation eviction is not asserted on pool 0.10.x.

### ZNS atomic batch debit + idempotency

- [`ZnsDispatcherService`](../../apps/api-worker/src/services/zns-dispatcher.ts):
  - Candidate = WAITING index 2 in same bucket (`priority_boost DESC, created_at ASC`).
  - Idempotency key `zns_approaching_${ticket.id}` via `znsApproachingIdempotencyKey` ([`packages/shared`](../../packages/shared/src/schemas.ts)).
  - Pre-check ledger by `reference_code`; skip with `ALREADY_SENT`.
  - Atomic `db.batch()`: conditional `UPDATE merchants … WHERE wallet_balance_vnd >= 400` + `INSERT wallet_ledger` (`tx_type: ZNS_CALL_ALERT`, `amount_vnd: -400`).
  - Insufficient balance → `INSUFFICIENT_WALLET`, no ledger/send.
- Wired from host `SEAT` (best-effort; seat still succeeds if ZNS fails).
- Specs: charge A·014 when A·012 seated; second call no double-charge; wallet `<400` skips.

### No unbounded D1 polling

- No `setInterval` / client poll loops in `merchant-web` or `zalo-mini-app` (Phase 3/4 UI not in scope yet).
- Live path uses per-branch DO WebSockets instead of D1 polling for queue updates.

### No `MAX+1` ticket-seq regressions

- `POST /api/tickets` still uses atomic `UPDATE queue_buckets SET current_seq = current_seq + 1 … RETURNING` + batch insert ([`tickets.ts`](../../apps/api-worker/src/routes/tickets.ts)).
- Repo-wide grep: no application `SELECT MAX(seq) + 1` for issuance.
- Only remaining `MAX(…) + 1` is `BUMP_PRIORITY` on `priority_boost` (plan §4.5 / Phase 1 accepted by design).

---

## Anti-Patterns Checked

| # | Anti-pattern (plan.md §5) | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | `SELECT MAX(seq) + 1` for ticket numbers | **CLEAR** | Atomic `UPDATE … RETURNING` + batch insert unchanged |
| 2 | Unbounded client polling on D1 | **CLEAR** | DO hibernation WebSockets for live fan-out; no UI poll loops |
| 3 | Forcing `getPhoneNumber` on Zalo launch | N/A Phase 2 backend | Phase 3 Mini App |
| 4 | Resetting `created_at` on re-bucket | **CLEAR** | Unchanged from Phase 1 |
| 5 | Unbounded host action buttons | N/A Phase 2 backend | Phase 4 Host POS |
| 6 | UTC midnight daily reset | **CLEAR** | Cron `0 21 * * *` unchanged |

Checklist extras from gate brief:

- **Hibernation API:** `acceptWebSocket` used (not long-lived `server.accept()` only).
- **ZNS ledger idempotency:** Key + skip path tested; atomic debit batch present.
- **MAX+1 regressions:** None for ticket sequence.

---

## Issues Found

None critical.

| Severity | Item | File | Notes |
| :--- | :--- | :--- | :--- |
| Low (deferred) | `wallet_ledger.reference_code` has no UNIQUE index | `schema.sql` | App-level SELECT + conditional wallet UPDATE mitigates; concurrent dual notify could race-insert. Recommend UNIQUE on `reference_code` where not null in a later migration. |
| Low (by design) | `BUMP_PRIORITY` uses `MAX(priority_boost)+1` | `host-queue.ts` | Same as Phase 1; not seq-issuance anti-pattern. |
| Low (tooling) | DO suite does not assert hibernation eviction | `durable-object.spec.ts` | Pool 0.10.x limitation; code path uses hibernation API correctly. |

---

## Gate Decision: **PASS**

Phase 2 exit criteria are met. Lint, typecheck, shared unit tests, and api-worker integration + DO suites are green. Hibernation `acceptWebSocket`, WebSocket fan-out, ZNS atomic debit with idempotency key, no D1 polling anti-pattern, and no ticket-seq `MAX+1` regressions are verified.

**AGENT-BACKEND:** No blocking fixes required. Proceed to Phase 3 when scheduled (Customer Zalo Mini App — Braun Hardware UI). Do not treat this report as starting Phase 3 implementation.
