# LượtĐi (QueueVN) — Master Architecture & Multi-Agent TDD Implementation Blueprint

Phases 0–4 are implemented. Current work is the role and usability pass in docs/product/actors.md. Do not rescaffold.

- **Target Market:** Vietnam B2B2C Virtual Queueing Platform (inspired by QueQ Thailand)
- **Design System:** Direction II — Braun / Dieter Rams Precision Hardware Grid
- **Core Stack:** Zalo Mini App (React + Vite + Tailwind) | Merchant/Admin PWA (Cloudflare Pages) | Cloudflare Workers (Hono + TypeScript) | Cloudflare D1 (SQLite) | Cloudflare Durable Objects (WebSockets)
- **Execution Paradigm:** Orchestrator-Led Multi-Agent Test-Driven Development (Strict Red-Green-Refactor)

---

## 1. AI Orchestrator & Sub-Agent Execution Protocol

This document serves as the system prompt and master specification for the **Lead Orchestrator Agent**. The Orchestrator **never writes production application code directly**; instead, it decomposes tasks, assigns bounded contexts to specialized Sub-Agents, enforces strict Test-Driven Development (TDD) gates, and validates outputs before merging.

### 1.1 Sub-Agent Roster & Bounded Responsibilities

| Sub-Agent ID | Role | Scope & Write Permissions | Verification Command |
| :--- | :--- | :--- | :--- |
| **`AGENT-RESEARCH`** | Domain & API Spike Agent | `docs/spikes/*` — Verifies Zalo Mini App SDK (`zmp-sdk`), ZNS templates, VietQR webhook schemas, and Cloudflare D1 limits before code generation. | `pnpm validate:docs` |
| **`AGENT-SPEC`** | Test & Contract Author (Red Phase) | `packages/shared/src/**`, `**/*.test.ts`, `**/*.spec.tsx` — Writes Zod schemas, SQLite migrations, and **failing** unit/integration/UI tests. Prohibited from writing implementation logic. | `pnpm test` *(Must fail on new specs)* |
| **`AGENT-BACKEND`** | Edge & D1 Engineer (Green Phase) | `apps/api-worker/src/**` — Implements Hono routes, Drizzle ORM queries, atomic D1 transactions, and Durable Objects to make `AGENT-SPEC` tests pass. | `pnpm --filter api-worker test` |
| **`AGENT-FRONTEND`** | Braun Design System Engineer | `packages/ui-braun/**`, `apps/zalo-mini-app/src/**`, `apps/merchant-web/src/**` — Builds strict Braun-styled components and state hooks to pass UI specs. | `pnpm --filter "./apps/*" test` |
| **`AGENT-QA`** | Adversarial Reviewer & Linter | Read-only across repo + CI runner — Audits for Anti-Patterns, race conditions, and UI violations (emojis, rounded corners, shadows). | `pnpm lint && pnpm typecheck && pnpm test:ci` |

### 1.2 The Strict Hand-Off Loop (Per Feature Task)

```text
+------------------+   1. Define Zod Contract & Failing Test (RED)   +------------------+
|   ORCHESTRATOR   | ----------------------------------------------> |    AGENT-SPEC    |
+--------+---------+                                                 +--------+---------+
         |                                                                    |
         | 4. Merge or Reject                 2. Verify Test Fails for Right Reason
         v                                                                    v
+------------------+   3. Audit Code, Types, & Anti-Slop Rules       +------------------+
|     AGENT-QA     | <---------------------------------------------- | AGENT-BACKEND /  |
+------------------+                                                 |  AGENT-FRONTEND  |
                                                                     +------------------+
```

1. **Gate 1 (Contract Lock):** `AGENT-SPEC` defines the input/output Zod schemas in `packages/shared` and writes comprehensive unit/integration tests. Orchestrator verifies tests fail (`RED`).
2. **Gate 2 (Minimal Implementation):** `AGENT-BACKEND` or `AGENT-FRONTEND` writes the minimal production code required to turn the test suite `GREEN`.
3. **Gate 3 (Adversarial Audit):** `AGENT-QA` runs static analysis, checks SQL query plans (`EXPLAIN QUERY PLAN`), and runs the Anti-Slop CSS linter. Any violation kicks the task back to Step 2.

---

## 2. System Architecture & Monorepo Topology

### 2.1 Workspace Directory Structure (`pnpm` + `Turborepo`)

```text
luotdi-monorepo/
├── apps/
│   ├── api-worker/               # Cloudflare Worker (Hono + Drizzle + Durable Objects)
│   │   ├── src/
│   │   │   ├── db/               # D1 schema, migrations, atomic SQL helpers
│   │   │   ├── do/               # BranchQueueRoom Durable Object (WebSockets)
│   │   │   ├── routes/           # public.ts, tickets.ts, host.ts, admin.ts, webhooks.ts
│   │   │   ├── services/         # queue-engine.ts, wait-estimator.ts, zns-dispatcher.ts
│   │   │   └── index.ts
│   │   ├── test/                 # @cloudflare/vitest-pool-workers integration tests
│   │   └── wrangler.toml
│   ├── zalo-mini-app/            # Customer-facing Zalo Mini App (React + Vite)
│   │   ├── src/
│   │   │   ├── pages/            # Marketplace, BranchCheckIn, LivePass
│   │   │   ├── hooks/            # useQueueSocket, useZaloIdentity
│   │   │   └── app.ts
│   │   └── app-config.json       # Zalo Mini App manifest
│   └── merchant-web/             # B2B PWA on Cloudflare Pages (Host, TV, Owner, SuperAdmin)
│       └── src/
│           ├── modules/
│           │   ├── host-pos/     # iPad Tactical Queue Controller
│           │   ├── tv-kiosk/     # 16:9 Smart TV Caller + Web Speech TTS
│           │   ├── owner-admin/  # Bucket sizing config, QR PDF generator, ZNS Wallet
│           │   └── super-admin/  # Platform God-mode, tenant billing, cron monitor
├── packages/
│   ├── shared/                   # Shared Zod schemas, Ticket State Machine, constants
│   └── ui-braun/                 # Shared Braun Design System primitives & Tailwind preset
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 3. Design System Enforcement: Direction II ("Braun Precision Grid")

To prevent generic "AI slop" UI, `packages/ui-braun/tailwind.preset.js` and an ESLint rule (`no-slop-ui`) strictly govern all frontend code.

### 3.1 Token Specification

| Token Category | Token Name | Value | Usage Rule |
| :--- | :--- | :--- | :--- |
| **Surface** | `bg-chassis` | `#E6E5E0` | Outer viewport / hardware casing background |
| **Surface** | `bg-panel` | `#F4F3EF` | Primary content cells and active ticket surfaces |
| **Surface** | `bg-ink` | `#111111` | High-contrast inverted header cells & primary buttons |
| **Border** | `border-grid` | `#C8C6BE` | Exposed `1px solid` structural grid hairlines |
| **Typography** | `text-carbon` | `#111111` | Primary text, ticket numbers, guest names |
| **Typography** | `text-graphite` | `#66645E` | Technical micro-labels (`01 / PARTY SIZE`, `EST. WAIT`) |
| **Signal** | `signal-orange` | `#FF4400` | Active call state (`SUMMONED`), primary physical action keycap |
| **Signal** | `signal-amber` | `#D97706` | Grace period (`HELD`) countdown indicator |
| **Signal** | `signal-green` | `#15803D` | Operational indicator (`QUEUE OPEN`, `SEATED`) |

### 3.2 Hard UI Constraints (Enforced by `AGENT-QA`)

1. **Zero Border Radius:** `rounded-*` classes above `2px` (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`) are **banned** in `tailwind.preset.js` (overridden to `0px`, except status LED dots which use `4px` square or `50%` `6px` hardware LED indicators).
2. **Zero Drop Shadows:** `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` are **banned**. Depth is achieved strictly through `1px solid #C8C6BE` cell borders and tactile `border-b-2 border-[#111111]` keycap bezels.
3. **Zero Emojis:** Unicode emoji ranges (`\u{1F300}-\u{1F9FF}`) are blocked via ESLint regex across all `.tsx` files. Use numbered technical labels (`01`, `02`, `03`) or `1.5px` stroke geometric SVGs.
4. **Font Pairing & Tabular Numerals:**
   - Technical Labels, Ticket Codes (`A·014`), Timers, and Counts: `'JetBrains Mono', monospace` with `font-variant-numeric: tabular-nums`.
   - Vietnamese Body Copy & Guest Names: `'Plus Jakarta Sans', sans-serif` for clean diacritic stacking.

---

## 4. Core Domain Patterns & Engineering Specifications

### 4.1 Pattern 1: Atomic Sequential Ticket Generation (D1 Concurrency Safe)

- **Problem:** If two customers scan a restaurant's QR code at the same millisecond, a standard `SELECT MAX(seq_number) + 1` followed by an `INSERT` causes a race condition and duplicate ticket numbers (`A·015` issued twice).
- **Solution:** Use a single atomic `UPDATE ... RETURNING` statement on `queue_buckets` paired with `db.batch()` inside Cloudflare D1.

```sql
-- Step 1 inside D1 Atomic Batch: Increment and return the exact sequence number
UPDATE queue_buckets
SET current_seq = current_seq + 1
WHERE id = ?1 AND branch_id = ?2 AND is_active = 1
RETURNING current_seq, prefix, active_counters, rolling_turnover_mins;
```

### 4.2 Pattern 2: Dynamic Multi-Industry Bucket Router

To support **Restaurants** (`PARTY_SIZE` mode) today and **Clinics/Banks** (`SERVICE_TYPE` mode) tomorrow without schema changes:
- When `branch.routing_mode === 'PARTY_SIZE'`: The engine selects the active bucket where `min_pax <= input.pax_count AND max_pax >= input.pax_count`.
- When `branch.routing_mode === 'SERVICE_TYPE'`: The customer explicitly selects `input.bucket_id` (e.g., `General Consultation` vs. `Lab Work`).

### 4.3 Pattern 3: Rolling Wait-Time Estimator with Outlier Clamping

Static wait times fail during peak hours. Whenever a ticket transitions from `CALLED` (or `WAITING`) to `SEATED`, the backend calculates `actual_wait = (seated_at - created_at) / 60`.
- **Outlier Clamping:** Ignore transitions `< 2` minutes (walk-in immediate seating) or `> 180` minutes (unclosed stale tickets).
- **Exponential Moving Average (EMA):**
  `new_rolling_turnover = Math.round(0.7 * old_turnover + 0.3 * actual_turnover)`
- **Live Customer Estimate Formula:**
  `estimated_wait_mins = Math.ceil((parties_ahead_in_bucket + 1) / active_counters_in_bucket) * rolling_turnover_mins`

### 4.4 Pattern 4: Deterministic Ticket State Machine (`packages/shared/src/state-machine.ts`)

```text
                   +------------------------------+
                   |           WAITING            |
                   +------+----------------+------+
             Host Summons |                | Guest/Host Cancels
                          v                v
                   +--------------+ +-------------+
        +--------->|    CALLED    | |  CANCELLED  |
        |          +--+--------+--+ +-------------+
        |             |        |           ^
Re-Summon|   Host Holds|        |Host Seats | Grace Period Expired (10m)
        |  (Missed)   v        v           | or Host Cancels
        |          +--------------+ +------+------+
        +----------|     HELD     |->   SEATED    |
                   +--------------+ +-------------+
```

- **Valid Transitions Map:**
  - `WAITING` -> `CALLED` | `CANCELLED`
  - `CALLED` -> `SEATED` | `HELD` | `CANCELLED`
  - `HELD` -> `CALLED` | `SEATED` | `CANCELLED`
  - `SEATED` -> *(Terminal State)*
  - `CANCELLED` -> *(Terminal State)*
- **Ad-Hoc Mutations on `WAITING`:**
  - `BUMP_PRIORITY`: Sets `priority_boost = (SELECT MAX(priority_boost) + 1 FROM tickets WHERE bucket_id = ?)` so VIP/elderly guests move to the top of the `WAITING` queue without altering their `display_number`.
  - `CHANGE_BUCKET`: Updates `bucket_id` and `pax_count` when a party's size changes mid-wait, **preserving original `created_at`** so they retain seniority in the new bucket.

### 4.5 Pattern 5: Prepaid ZNS Notification Ledger (Double-Entry Deduction)

To protect platform margins against Zalo ZNS fees (~250–350 VND/msg), every ZNS dispatch must execute an atomic check-and-deduct:
1. Check `merchants.wallet_balance_vnd >= 400`. If false, skip ZNS dispatch and fall back to in-app WebSocket alert only.
2. Insert row into `wallet_ledger` (`id`, `merchant_id`, `ticket_id`, `amount_vnd: -400`, `type: 'ZNS_FEE'`, `created_at`) and decrement `merchants.wallet_balance_vnd` in a single `db.batch()`.

---

## 5. Anti-Patterns to Strictly Avoid

`AGENT-QA` must reject any Pull Request exhibiting these architectural or UX anti-patterns:

| Anti-Pattern | Why It Fails | Mandatory Correct Pattern |
| :--- | :--- | :--- |
| **1. `SELECT MAX(seq) + 1` in Application Code** | Causes race conditions and duplicate ticket codes under concurrent QR scans. | Use SQLite atomic `UPDATE queue_buckets SET current_seq = current_seq + 1 RETURNING current_seq`. |
| **2. Unbounded Client Polling on D1** | 500 waiting customers polling every 2 seconds = 15,000 D1 queries/minute, exhausting D1 read quotas and spiking latency. | Route live ticket listeners through a single **Cloudflare Durable Object (`BranchQueueRoom`)** per active branch using WebSockets, or cache `GET /api/branches/:id/snapshot` in Cloudflare Edge Cache (`Cache-Control: s-maxage=2`). |
| **3. Forcing `getPhoneNumber` on Zalo Launch** | Zalo blocks or delays Mini Apps that demand sensitive permissions before showing value, and users drop off at permission prompts. | Load `getUserInfo` (non-sensitive `zalo_user_id`) silently. Allow instant ticket creation; offer phone/OA opt-in as an optional toggle on the Live Pass screen. |
| **4. Resetting `created_at` When Re-Bucketing** | If a party of 2 waits 20 minutes, then 1 friend joins (moving them from Bucket A to Bucket B), resetting `created_at` sends them to the very back of Bucket B. | Mutate `bucket_id` and `pax_count` while keeping `created_at` immutable; sort `WAITING` tickets by `(priority_boost DESC, created_at ASC)`. |
| **5. Unbounded Action Buttons on Host Rows** | Rendering 5 tiny buttons (`Call`, `Seat`, `Hold`, `Bump`, `Cancel`) on every row leads to fat-finger mistakes on an iPad. | **Progressive Disclosure:** `WAITING` rows show 1 primary button (`SUMMON`) + a `•••` drawer trigger. `CALLED` tickets move to the pinned **Summoned Strip** at the top of the screen with `SEAT GUEST` and `HOLD 10M`. |
| **6. Hardcoding UTC Midnight for Daily Reset** | `00:00 UTC` is `07:00 AM` in Vietnam—right when breakfast cafes and clinics already have active queues. | Schedule the Cloudflare Cron Trigger at `21:00 UTC` (`04:00 AM` Vietnam `UTC+7`). |

---

## 6. Database Schema & Indexing Blueprint (`apps/api-worker/src/db/schema.sql`)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry_type TEXT NOT NULL DEFAULT 'RESTAURANT', -- 'RESTAURANT' | 'CLINIC' | 'SALON' | 'BANK'
  plan_tier TEXT NOT NULL DEFAULT 'FREE',           -- 'FREE' | 'PRO'
  monthly_ticket_count INTEGER NOT NULL DEFAULT 0,
  wallet_balance_vnd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Ho Chi Minh',
  qr_code_token TEXT UNIQUE NOT NULL,
  routing_mode TEXT NOT NULL DEFAULT 'PARTY_SIZE',  -- 'PARTY_SIZE' | 'SERVICE_TYPE'
  allow_remote_queue INTEGER NOT NULL DEFAULT 1,
  is_paused INTEGER NOT NULL DEFAULT 0,
  grace_period_mins INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL
);

CREATE TABLE queue_buckets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,                             -- 'A', 'B', 'C'
  label_vi TEXT NOT NULL,                           -- '01-02 KHÁCH'
  label_en TEXT NOT NULL,                           -- '01-02 GUESTS'
  min_pax INTEGER NOT NULL DEFAULT 1,
  max_pax INTEGER NOT NULL DEFAULT 2,
  active_counters INTEGER NOT NULL DEFAULT 4,
  rolling_turnover_mins INTEGER NOT NULL DEFAULT 20,
  current_seq INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(branch_id, prefix)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  bucket_id TEXT NOT NULL REFERENCES queue_buckets(id) ON DELETE CASCADE,
  ticket_date TEXT NOT NULL,                        -- 'YYYY-MM-DD' in Asia/Ho_Chi_Minh
  seq_number INTEGER NOT NULL,
  display_number TEXT NOT NULL,                     -- 'A·014'
  zalo_user_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone_masked TEXT,
  customer_phone_encrypted TEXT,
  pax_count INTEGER NOT NULL DEFAULT 2,
  source TEXT NOT NULL DEFAULT 'QR_ONSITE',         -- 'QR_ONSITE' | 'MARKETPLACE' | 'HOST_MANUAL'
  status TEXT NOT NULL DEFAULT 'WAITING',           -- 'WAITING' | 'CALLED' | 'HELD' | 'SEATED' | 'CANCELLED'
  priority_boost INTEGER NOT NULL DEFAULT 0,
  preferences_json TEXT NOT NULL DEFAULT '[]',      -- e.g. '["HIGH_CHAIR","COUNTER"]'
  created_at INTEGER NOT NULL,
  called_at INTEGER,
  held_at INTEGER,
  seated_at INTEGER,
  cancelled_at INTEGER
);

-- Critical composite index for instant O(log n) queue ordering & position calculation
CREATE INDEX idx_tickets_queue_order
ON tickets(branch_id, bucket_id, status, priority_boost DESC, created_at ASC);

-- Anti-spam index: prevent a single Zalo user from hoarding multiple active tickets at one branch
CREATE INDEX idx_tickets_active_zalo_user
ON tickets(branch_id, zalo_user_id, status);

CREATE TABLE wallet_ledger (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  ticket_id TEXT,
  amount_vnd INTEGER NOT NULL,                      -- Positive for VietQR top-up, negative for ZNS deduction
  tx_type TEXT NOT NULL,                            -- 'TOPUP_VIETQR' | 'ZNS_CALL_ALERT' | 'ADMIN_GRANT'
  reference_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,                                 -- NULL for Platform SUPER_ADMIN
  branch_id TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,                               -- 'SUPER_ADMIN' | 'MERCHANT_OWNER' | 'BRANCH_HOST'
  created_at INTEGER NOT NULL
);
```

---

## 7. Phased Test-Driven Implementation Plan

### Phase 0: Pre-Flight Research Spikes & Workspace Bootstrap
**Assigned Agents:** `AGENT-RESEARCH` -> `AGENT-SPEC`

1. **Task 0.1 — Monorepo & Braun Token Setup:**
   - Initialize `pnpm` workspaces, `turbo.json`, TypeScript strict config, and `packages/ui-braun` with the custom ESLint rule disallowing emojis, `rounded-*` (`>2px`), and `shadow-*`.
2. **Task 0.2 — Cloudflare D1 + Vitest Pool Harness:**
   - Configure `@cloudflare/vitest-pool-workers` in `apps/api-worker` so every backend test runs against an isolated in-memory Cloudflare D1 SQLite instance and Durable Object runtime.
3. **Gate 0 Exit Criteria:** `pnpm test`, `pnpm typecheck`, and `pnpm lint` execute cleanly in `< 5 seconds`.

---

### Phase 1: Core Queue Domain Engine & Atomic D1 Layer (TDD)
**Assigned Agents:** `AGENT-SPEC` (Red) -> `AGENT-BACKEND` (Green) -> `AGENT-QA` (Refactor)

#### Step 1.1: Ticket State Machine & Bucket Routing (`packages/shared`)
- **RED (`AGENT-SPEC`):** Write unit tests in `packages/shared/test/state-machine.test.ts`:
  - Assert valid transitions (`WAITING -> CALLED -> HELD -> SEATED`).
  - Assert illegal transitions throw `InvalidTicketTransitionError` (e.g., `SEATED -> WAITING`, `WAITING -> HELD`).
  - Assert party size `1` and `2` route to Bucket `A`, `3` and `4` route to Bucket `B`, `5..12` route to Bucket `C`.
  - Assert `SERVICE_TYPE` mode routes strictly by `bucketId` regardless of `paxCount`.
- **GREEN (`AGENT-BACKEND`):** Implement pure functions `transitionTicket()`, `resolveBucket()`, and `calculateEstimatedWait()`.

#### Step 1.2: Concurrency-Safe Ticket Issuance (`POST /api/tickets`)
- **RED (`AGENT-SPEC`):** Write integration test in `apps/api-worker/test/tickets.spec.ts`:
  - Fire `Promise.all()` with **25 simultaneous `POST /api/tickets` requests** for 2-person parties at the same branch.
  - Assert all 25 succeed with strictly unique, sequential codes `A·001` through `A·025` with zero duplicates or SQLite lock errors.
  - Assert a second request from the same `zalo_user_id` while their first ticket is `WAITING` returns `409 Conflict` (`ACTIVE_TICKET_EXISTS`).
  - Assert when `branch.is_paused === 1`, `POST /api/tickets` returns `423 Locked` (`QUEUE_PAUSED`).
  - Assert when `merchant.plan_tier === 'FREE'` and `monthly_ticket_count >= 200`, returns `402 Payment Required` (`FREE_QUOTA_EXCEEDED`).
- **GREEN (`AGENT-BACKEND`):** Implement Hono handler using `env.DB.batch()` combining the duplicate check, `UPDATE queue_buckets SET current_seq = current_seq + 1 RETURNING *`, and `INSERT INTO tickets`.

#### Step 1.3: Ad-Hoc Host Operations (`PATCH /api/host/tickets/:id/action`)
- **RED (`AGENT-SPEC`):** Write integration tests for the 5 host mutations:
  1. `SUMMON`: Sets `status = 'CALLED'`, records `called_at`.
  2. `HOLD`: Sets `status = 'HELD'`, records `held_at`.
  3. `SEAT`: Sets `status = 'SEATED'`, updates bucket's `rolling_turnover_mins` via EMA formula (clamping outliers `<2m` or `>180m`).
  4. `BUMP_PRIORITY`: Increments `priority_boost` so ticket sorts before all normal `WAITING` tickets in that bucket.
  5. `CHANGE_BUCKET`: Moves ticket `A·014` (2 pax) to Bucket `B` (4 pax), keeping `display_number = 'A·014'` (so the customer isn't confused by a new code) and preserving original `created_at` timestamp so their wait time is honored.
- **GREEN (`AGENT-BACKEND`):** Implement `HostQueueService` and Hono route handlers with JWT role verification (`BRANCH_HOST` or `MERCHANT_OWNER`).

#### Step 1.4: Nightly 04:00 AM UTC+7 Reset & Expired Hold Sweeper
- **RED (`AGENT-SPEC`):**
  - Test 1: Given a ticket in `HELD` state where `now - held_at > branch.grace_period_mins * 60`, running `sweepExpiredHolds()` transitions it to `CANCELLED`.
  - Test 2: Running `dailyResetCron()` resets `current_seq = 0` across all `queue_buckets` and marks any unclosed `WAITING`/`CALLED`/`HELD` tickets from previous dates as `CANCELLED`.
- **GREEN (`AGENT-BACKEND`):** Implement Cloudflare Worker `scheduled()` handler configured with `crons = ["0 21 * * *"]` (`04:00 AM` Vietnam time).

---

### Phase 2: Real-Time Durable Objects & ZNS Wallet Ledger (TDD)
**Assigned Agents:** `AGENT-SPEC` (Red) -> `AGENT-BACKEND` (Green)

#### Step 2.1: `BranchQueueRoom` Durable Object
- **RED (`AGENT-SPEC`):** Write Durable Object WebSocket test (`apps/api-worker/test/durable-object.spec.ts`):
  - Connect 3 mock WebSocket clients to `BranchQueueRoom` (1 Host iPad, 1 Smart TV, 1 Customer waiting on `A·014`).
  - Trigger `SUMMON` on `A·014`.
  - Assert all 3 sockets receive a `QUEUE_UPDATED` JSON payload within `<50ms`, and the Customer socket receives a targeted `YOUR_TURN_CALLED` event.
- **GREEN (`AGENT-BACKEND`):** Implement `BranchQueueRoom` using Cloudflare's **WebSocket Hibernation API** (`this.ctx.acceptWebSocket(server)`) so idle connections cost zero billable duration until a state change occurs.

#### Step 2.2: Double-Entry ZNS Wallet & Auto-Alert Trigger
- **RED (`AGENT-SPEC`):**
  - Test that when `A·012` is seated, the ticket now **2 spots away** (`A·014`) triggers the `ApproachingTurn` hook.
  - If `merchant.wallet_balance_vnd >= 400`, deduct `400`, insert a `wallet_ledger` record, and dispatch the ZNS payload.
  - Confirm idempotency: if `A·014` is bumped or re-evaluated, it **never** deducts or sends the "2 spots away" ZNS twice for the same ticket.
- **GREEN (`AGENT-BACKEND`):** Implement `ZnsDispatcherService` with idempotency key `zns_approaching_${ticket.id}` in `wallet_ledger`.

---

### Phase 3: Customer Zalo Mini App — Braun Hardware UI (TDD)
**Assigned Agents:** `AGENT-SPEC` (Red) -> `AGENT-FRONTEND` (Green) -> `AGENT-QA` (Audit)

#### Step 3.1: Braun UI Primitives (`packages/ui-braun`)
- Build and snapshot-test the 6 core hardware primitives:
  1. `<BraunChassis/>`: Outer container with `#E6E5E0` surface and `1px solid #C8C6BE` frame.
  2. `<GridCell label="01 / PARTY SIZE"/>`: Exposed hairline container with uppercase `10px` `JetBrains Mono` index header.
  3. `<KeycapButton variant="primary | secondary | danger"/>`: Tactile rectangular button with `border-b-2` physical press state.
  4. `<SegmentedMatrix/>`: Horizontal 1–8+ numeric selector with zero gap (`-ml-[1px]` collapsed borders).
  5. `<LedIndicator state="active | warning | idle"/>`: Crisp `6px` status light.
  6. `<TabularMetric size="display | lg | md" value="A·014"/>`: Strict `tabular-nums` monospace readout.

#### Step 3.2: Customer Screens (`apps/zalo-mini-app`)
- **RED (`AGENT-SPEC`):** Write Vitest + React Testing Library specs (`apps/zalo-mini-app/src/__tests__/customer-flow.spec.tsx`):
  1. **QR Deep-Link Entry (`/b/:qr_token`):** Renders branch header, `01 / SELECT PARTY SIZE` matrix (`1`–`8+`), auto-highlights matching bucket (`A`, `B`, or `C`) and live wait estimate.
  2. **1-Tap Issue Pass:** Clicking `ISSUE QUEUE PASS` calls `POST /api/tickets` and transitions immediately to `/ticket/:id`.
  3. **Live Pass Screen (`/ticket/:id`):** Displays giant `A·014` readout, horizontal 3-cell metric strip (`NOW SERVING`, `AHEAD OF YOU`, `EST. WAIT`), and reacts instantaneously to WebSocket `YOUR_TURN_CALLED` events by flipping the upper chassis to International Orange (`#FF4400` — `PROCEED TO HOST STAND`).
  4. **Marketplace Discovery (`/`):** Lists nearby branches with live waiting counts and filters by category (`ALL`, `RESTAURANT`, `CLINIC`, `CAFE`).
- **GREEN (`AGENT-FRONTEND`):** Implement screens and mock-safe `useZaloIdentity` wrapper (falls back to deterministic browser UUID in local dev).

---

### Phase 4: Merchant PWA — Host POS, Smart TV & Admin (TDD)
**Assigned Agents:** `AGENT-SPEC` (Red) -> `AGENT-FRONTEND` (Green) -> `AGENT-QA` (Audit)

#### Step 4.1: Tactical Host POS Console (`/host/:branch_id`)
- **RED (`AGENT-SPEC`):** Write component interaction tests (`apps/merchant-web/src/__tests__/host-pos.spec.tsx`):
  - Assert top bar displays live metrics (`WAITING`, `AVG WAIT`, `QUEUE STATUS`) + 1-tap `PAUSE QUEUE` toggle + `+ WALK-IN` modal trigger.
  - Assert **Pinned Summoned Strip** only appears when `>= 1` ticket has `status === 'CALLED'`, displaying `SEAT GUEST` and `HOLD 10M` buttons.
  - Assert **Waiting Ledger Table** rows display a single primary `SUMMON` button on the right, keeping secondary ad-hoc actions (`Bump Priority`, `Change Party Size`, `Cancel`) inside a clean row action drawer.
- **GREEN (`AGENT-FRONTEND`):** Implement Host POS optimized for 1024x768 iPad landscape and portrait touch viewports (`min-h-[48px]` touch targets).

#### Step 4.2: Smart TV 16:9 Caller Screen (`/tv/:branch_slug`)
- **RED (`AGENT-SPEC`):**
  - Test that incoming `YOUR_TURN_CALLED` WebSocket event flashes the ticket number on the left 50% split screen (`NOW SUMMONING`) and invokes the Vietnamese audio chime + Web Speech API (`window.speechSynthesis` with `lang = 'vi-VN'`: *"Xin mời quý khách số A, không một bốn, vào bàn"*).
  - Test that the right 50% split screen renders the live bucket summary (`BÀN A`, `BÀN B`, `BÀN C`) alongside a high-contrast Static QR code for walk-ins.
- **GREEN (`AGENT-FRONTEND`):** Implement TV Kiosk view with wake-lock support (`navigator.wakeLock`) so the TV screen never sleeps.

#### Step 4.3: Merchant Owner Config & Super-Admin God Mode (`/admin` & `/super-admin`)
- **RED (`AGENT-SPEC`):**
  - Test dynamic bucket editor (adding/editing prefixes `A`–`F`, min/max pax, active table counters).
  - Test **VietQR Top-Up Generator**: Generates a dynamic VietQR payment payload with transfer memo `LUOTDI <MERCHANT_SLUG>` and updates wallet balance upon webhook callback (`POST /api/webhooks/sepay`).
  - Test **Super-Admin God Mode**: Impersonate any branch, override `plan_tier` (`FREE` <-> `PRO`), and force-clear stuck queues.
- **GREEN (`AGENT-FRONTEND` & `AGENT-BACKEND`):** Implement owner settings, printable A5 Braun-styled QR standee generator (`@react-pdf/renderer` or print stylesheet), and Super-Admin dashboard.

---

## 8. Orchestrator Kickoff Checklist (First Prompt to Execute)

To start autonomous implementation using this plan, feed the following command sequence to your Orchestrator Agent:

1. **Initialize Phase 0:** Instruct `AGENT-SPEC` to scaffold the `pnpm` workspace, `packages/shared`, `packages/ui-braun` (with the Braun Tailwind preset and anti-slop ESLint rules), and `apps/api-worker` with `schema.sql`.
2. **Execute Phase 1 (Red -> Green):** Instruct `AGENT-SPEC` to write `state-machine.test.ts` and the 25-concurrent-request race condition test in `tickets.spec.ts` before allowing `AGENT-BACKEND` to write any Hono or D1 code.
3. **Enforce Gate Reviews:** Require `AGENT-QA` to output a verification report (`Tests Passed | SQL Explain Verified | Zero UI Violations`) at the end of every phase before advancing.