import { env, SELF } from 'cloudflare:test';
import {
  BranchQueueBroadcastRequestSchema,
  QueueUpdatedEventSchema,
  WsClientHelloSchema,
  YourTurnCalledEventSchema,
  type BranchQueueBroadcastRequest,
  type WsClientHello,
  type WsServerEvent,
} from '@luotdi/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Ensure worker main is loaded for SELF / watch re-runs. */
import '../src/index';

/**
 * Harness notes (@cloudflare/vitest-pool-workers 0.10.x):
 * - Real DO WebSockets work via SELF `/api/branches/:id/ws` (or stub.fetch)
 *   with `Upgrade: websocket`, then `response.webSocket!.accept()`.
 * - DO WebSockets require `isolatedStorage: false` (Cloudflare known issue).
 * - On Windows, also set `singleWorker: true` so DO persist paths stay under
 *   MAX_PATH (per-file runner names otherwise cause SQLITE_CANTOPEN).
 * - See apps/api-worker/vitest.do.config.ts for both flags.
 * - `evictDurableObject` / hibernation helpers need pool ≥0.16; this suite
 *   does not assert hibernation — only fan-out delivery.
 * - Plan latency `<50ms` is aspirational locally; we use a generous eventual
 *   bound (2000ms) so the RED failure is missing events, not timing flakes.
 */

const MERCHANT_ID = 'merchant-do-1';
const BRANCH_ID = 'branch-do-1';
const BUCKET_A = 'bucket-do-a';
const MIDDLE_DOT = '\u00B7';
const DISPLAY_A014 = `A${MIDDLE_DOT}014`;
const TICKET_A014_ID = 'ticket-a014';

const HOST_AUTH_HEADERS = {
  'Content-Type': 'application/json',
  'X-Test-Staff-Role': 'BRANCH_HOST',
} as const;

const EVENT_WAIT_MS = 2000;

async function applySchema(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

const CLIENT_ID = 'client-test';

async function clearTables(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM tickets').run();
  await db.prepare('DELETE FROM wallet_ledger').run();
  await db.prepare('DELETE FROM staff_branch_assignments').run();
  await db.prepare('DELETE FROM queue_buckets').run();
  await db.prepare('DELETE FROM branches').run();
  await db.prepare('DELETE FROM staff_users').run();
  await db.prepare('DELETE FROM merchants').run();
  await db.prepare('DELETE FROM clients').run();
}

async function seedMerchantBranchBucket(db: D1Database): Promise<void> {
  const now = Date.now();

  await db
    .prepare(`INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)`)
    .bind(CLIENT_ID, 'Test Client', now)
    .run();

  await db
    .prepare(
      `INSERT INTO merchants (
        id, client_id, name, slug, industry_type, plan_tier,
        monthly_ticket_count, wallet_balance_vnd, status, created_at
      ) VALUES (?, ?, ?, ?, 'RESTAURANT', 'FREE', 0, 0, 'ACTIVE', ?)`,
    )
    .bind(MERCHANT_ID, CLIENT_ID, 'DO Cafe', 'do-cafe', now)
    .run();

  await db
    .prepare(
      `INSERT INTO branches (
        id, merchant_id, name, address, district, city,
        qr_code_token, routing_mode, allow_remote_queue, is_paused,
        grace_period_mins, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, 10, ?)`,
    )
    .bind(
      BRANCH_ID,
      MERCHANT_ID,
      'DO Branch',
      '2 Nguyen Hue',
      'Quan 1',
      'qr-branch-do-1',
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO queue_buckets (
        id, branch_id, prefix, label_vi, label_en,
        min_pax, max_pax, active_counters, rolling_turnover_mins,
        current_seq, is_active
      ) VALUES (?, ?, 'A', '01-02 KHACH', '01-02 GUESTS', 1, 2, 4, 20, 14, 1)`,
    )
    .bind(BUCKET_A, BRANCH_ID)
    .run();
}

async function seedTicketA014(db: D1Database): Promise<void> {
  const createdAt = Date.now();
  const ticketDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(createdAt));

  await db
    .prepare(
      `INSERT INTO tickets (
        id, branch_id, bucket_id, ticket_date, seq_number, display_number,
        zalo_user_id, customer_name, pax_count, source, status,
        priority_boost, preferences_json, created_at
      ) VALUES (?, ?, ?, ?, 14, ?, NULL, 'Guest A014', 2, 'QR_ONSITE', 'WAITING', 0, '[]', ?)`,
    )
    .bind(TICKET_A014_ID, BRANCH_ID, BUCKET_A, ticketDate, DISPLAY_A014, createdAt)
    .run();
}

type SocketBag = {
  ws: WebSocket;
  messages: WsServerEvent[];
};

function parseServerEvent(raw: string | ArrayBuffer): WsServerEvent | null {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const queue = QueueUpdatedEventSchema.safeParse(json);
  if (queue.success) return queue.data;
  const turn = YourTurnCalledEventSchema.safeParse(json);
  if (turn.success) return turn.data;
  return null;
}

async function connectBranchSocket(
  hello: WsClientHello,
): Promise<SocketBag> {
  const parsedHello = WsClientHelloSchema.parse(hello);

  const response = await SELF.fetch(
    `http://localhost/api/branches/${parsedHello.branchId}/ws`,
    { headers: { Upgrade: 'websocket' } },
  );

  const ws = response.webSocket;
  if (!ws) {
    throw new Error(
      `Expected WebSocket upgrade, got status ${response.status}`,
    );
  }
  ws.accept();

  const bag: SocketBag = { ws, messages: [] };
  ws.addEventListener('message', (event) => {
    const parsed = parseServerEvent(event.data as string | ArrayBuffer);
    if (parsed) bag.messages.push(parsed);
  });

  ws.send(JSON.stringify(parsedHello));
  return bag;
}

function waitForEvent(
  bag: SocketBag,
  match: (event: WsServerEvent) => boolean,
  timeoutMs = EVENT_WAIT_MS,
): Promise<WsServerEvent> {
  const existing = bag.messages.find(match);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for WS event. Saw: ${JSON.stringify(bag.messages)}`,
        ),
      );
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const parsed = parseServerEvent(event.data as string | ArrayBuffer);
      if (parsed && match(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      bag.ws.removeEventListener('message', onMessage);
    };

    bag.ws.addEventListener('message', onMessage);
  });
}

/**
 * GREEN wiring: after HostQueueService SUMMON succeeds, Worker POSTs this body
 * to the branch DO `/broadcast` so sockets fan out. Specs may also call this
 * directly to isolate DO fan-out from host routing.
 */
async function postDoBroadcast(
  body: BranchQueueBroadcastRequest,
): Promise<Response> {
  const parsed = BranchQueueBroadcastRequestSchema.parse(body);
  const id = env.BRANCH_QUEUE_ROOM.idFromName(parsed.branchId);
  const stub = env.BRANCH_QUEUE_ROOM.get(id);
  return stub.fetch('https://branch-queue-room/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });
}

async function patchHostSummon(ticketId: string): Promise<Response> {
  return SELF.fetch(`http://localhost/api/host/tickets/${ticketId}/action`, {
    method: 'PATCH',
    headers: HOST_AUTH_HEADERS,
    body: JSON.stringify({ action: 'SUMMON' }),
  });
}

describe('BranchQueueRoom WebSocket fan-out (Phase 2.1)', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBucket(env.DB);
    await seedTicketA014(env.DB);
  });

  it('upgrades GET /api/branches/:branchId/ws to a WebSocket', async () => {
    const response = await SELF.fetch(
      `http://localhost/api/branches/${BRANCH_ID}/ws`,
      { headers: { Upgrade: 'websocket' } },
    );
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeTruthy();
    const ws = response.webSocket!;
    try {
      ws.accept();
    } finally {
      ws.close(1000, 'test done');
    }
  });

  it('fans QUEUE_UPDATED to Host+TV+Customer and YOUR_TURN_CALLED to Customer on SUMMON', async () => {
    const sockets: SocketBag[] = [];
    try {
      const host = await connectBranchSocket({
        type: 'HELLO',
        role: 'HOST',
        branchId: BRANCH_ID,
      });
      const tv = await connectBranchSocket({
        type: 'HELLO',
        role: 'TV',
        branchId: BRANCH_ID,
      });
      const customer = await connectBranchSocket({
        type: 'HELLO',
        role: 'CUSTOMER',
        branchId: BRANCH_ID,
        ticketId: TICKET_A014_ID,
      });
      sockets.push(host, tv, customer);

      const isQueueUpdated = (e: WsServerEvent): boolean =>
        e.type === 'QUEUE_UPDATED' &&
        e.ticketId === TICKET_A014_ID &&
        e.displayNumber === DISPLAY_A014 &&
        e.status === 'CALLED';

      const isYourTurn = (e: WsServerEvent): boolean =>
        e.type === 'YOUR_TURN_CALLED' &&
        e.ticketId === TICKET_A014_ID &&
        e.displayNumber === DISPLAY_A014;

      const hostQueueP = waitForEvent(host, isQueueUpdated);
      const tvQueueP = waitForEvent(tv, isQueueUpdated);
      const customerQueueP = waitForEvent(customer, isQueueUpdated);
      const customerTurnP = waitForEvent(customer, isYourTurn);

      // Host SUMMON must eventually notify the DO (GREEN wires HostQueue → /broadcast).
      const summonRes = await patchHostSummon(TICKET_A014_ID);
      expect(summonRes.status).toBe(200);

      // Explicit DO broadcast contract — GREEN may rely solely on host wiring;
      // calling both keeps RED failure mode = missing fan-out, not missing route.
      // RED stub returns 501; GREEN must accept BranchQueueBroadcastRequest and fan out.
      const broadcastRes = await postDoBroadcast({
        type: 'SUMMON',
        branchId: BRANCH_ID,
        ticketId: TICKET_A014_ID,
        displayNumber: DISPLAY_A014,
        status: 'CALLED',
        at: Date.now(),
      });
      await broadcastRes.text();

      const [hostEvt, tvEvt, customerEvt, turnEvt] = await Promise.all([
        hostQueueP,
        tvQueueP,
        customerQueueP,
        customerTurnP,
      ]);

      expect(QueueUpdatedEventSchema.parse(hostEvt).branchId).toBe(BRANCH_ID);
      expect(QueueUpdatedEventSchema.parse(tvEvt).branchId).toBe(BRANCH_ID);
      expect(QueueUpdatedEventSchema.parse(customerEvt).branchId).toBe(
        BRANCH_ID,
      );
      expect(YourTurnCalledEventSchema.parse(turnEvt).branchId).toBe(BRANCH_ID);

      expect(host.messages.some((m) => m.type === 'YOUR_TURN_CALLED')).toBe(
        false,
      );
      expect(tv.messages.some((m) => m.type === 'YOUR_TURN_CALLED')).toBe(
        false,
      );
    } finally {
      for (const bag of sockets) {
        try {
          bag.ws.close(1000, 'done');
        } catch {
          /* already closed */
        }
      }
    }
  });
});
