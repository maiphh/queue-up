import { env, SELF } from 'cloudflare:test';
import {
  ApiErrorSchema,
  HostTicketActionRequestSchema,
  HostTicketActionResponseSchema,
  type HostTicketActionRequest,
} from '@luotdi/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Ensure worker main is loaded for SELF / watch re-runs. */
import '../src/index';

const MERCHANT_ID = 'merchant-1';
const BRANCH_ID = 'branch-1';
const BUCKET_A = 'bucket-a';
const BUCKET_B = 'bucket-b';
const BUCKET_C = 'bucket-c';
/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';

/**
 * Auth bypass until JWT middleware lands in GREEN.
 * GREEN must honor `X-Test-Staff-Role: BRANCH_HOST | MERCHANT_OWNER` in test/miniflare env
 * (or equivalent test-only bypass) so these specs keep working without rewrite.
 */
const HOST_AUTH_HEADERS = {
  'Content-Type': 'application/json',
  'X-Test-Staff-Role': 'BRANCH_HOST',
} as const;

type TicketRow = {
  id: string;
  branch_id: string;
  bucket_id: string;
  display_number: string;
  seq_number: number;
  pax_count: number;
  status: string;
  priority_boost: number;
  created_at: number;
  called_at: number | null;
  held_at: number | null;
  seated_at: number | null;
  cancelled_at: number | null;
};

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

async function seedMerchantBranchBuckets(db: D1Database): Promise<void> {
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
    .bind(MERCHANT_ID, CLIENT_ID, 'Cafe Test', 'cafe-test', now)
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
      'District 1',
      '1 Nguyen Hue',
      'Quan 1',
      'qr-branch-1',
      now,
    )
    .run();

  const buckets = [
    {
      id: BUCKET_A,
      prefix: 'A',
      labelVi: '01-02 KHACH',
      labelEn: '01-02 GUESTS',
      minPax: 1,
      maxPax: 2,
      counters: 4,
      turnover: 20,
    },
    {
      id: BUCKET_B,
      prefix: 'B',
      labelVi: '03-04 KHACH',
      labelEn: '03-04 GUESTS',
      minPax: 3,
      maxPax: 4,
      counters: 3,
      turnover: 25,
    },
    {
      id: BUCKET_C,
      prefix: 'C',
      labelVi: '05-12 KHACH',
      labelEn: '05-12 GUESTS',
      minPax: 5,
      maxPax: 12,
      counters: 2,
      turnover: 35,
    },
  ];

  for (const b of buckets) {
    await db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      )
      .bind(
        b.id,
        BRANCH_ID,
        b.prefix,
        b.labelVi,
        b.labelEn,
        b.minPax,
        b.maxPax,
        b.counters,
        b.turnover,
      )
      .run();
  }
}

async function seedTicket(
  db: D1Database,
  opts: {
    id?: string;
    bucketId?: string;
    displayNumber?: string;
    seqNumber?: number;
    paxCount?: number;
    status?: string;
    priorityBoost?: number;
    createdAt?: number;
    calledAt?: number | null;
    heldAt?: number | null;
    seatedAt?: number | null;
    zaloUserId?: string;
    customerName?: string;
  } = {},
): Promise<TicketRow> {
  const id = opts.id ?? crypto.randomUUID();
  const bucketId = opts.bucketId ?? BUCKET_A;
  const seqNumber = opts.seqNumber ?? 1;
  const displayNumber =
    opts.displayNumber ?? `A${MIDDLE_DOT}${String(seqNumber).padStart(3, '0')}`;
  const createdAt = opts.createdAt ?? Date.now();
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
        priority_boost, preferences_json, created_at,
        called_at, held_at, seated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'QR_ONSITE', ?, ?, '[]', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      BRANCH_ID,
      bucketId,
      ticketDate,
      seqNumber,
      displayNumber,
      opts.zaloUserId ?? null,
      opts.customerName ?? 'Host Guest',
      opts.paxCount ?? 2,
      opts.status ?? 'WAITING',
      opts.priorityBoost ?? 0,
      createdAt,
      opts.calledAt ?? null,
      opts.heldAt ?? null,
      opts.seatedAt ?? null,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .bind(id)
    .first<TicketRow>();
  if (!row) throw new Error(`seedTicket failed: ${id}`);
  return row;
}

async function getTicket(db: D1Database, id: string): Promise<TicketRow> {
  const row = await db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .bind(id)
    .first<TicketRow>();
  if (!row) throw new Error(`ticket not found: ${id}`);
  return row;
}

async function getBucketTurnover(
  db: D1Database,
  bucketId: string,
): Promise<number> {
  const row = await db
    .prepare('SELECT rolling_turnover_mins AS t FROM queue_buckets WHERE id = ?')
    .bind(bucketId)
    .first<{ t: number }>();
  if (!row) throw new Error(`bucket not found: ${bucketId}`);
  return row.t;
}

async function patchHostAction(
  ticketId: string,
  body: HostTicketActionRequest,
): Promise<Response> {
  const parsed = HostTicketActionRequestSchema.parse(body);
  return SELF.fetch(`http://localhost/api/host/tickets/${ticketId}/action`, {
    method: 'PATCH',
    headers: HOST_AUTH_HEADERS,
    body: JSON.stringify(parsed),
  });
}

describe('PATCH /api/host/tickets/:id/action — host mutations', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB);
  });

  it('SUMMON: WAITING -> CALLED and records called_at', async () => {
    const ticket = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}001`,
      seqNumber: 1,
    });

    const before = Date.now();
    const res = await patchHostAction(ticket.id, { action: 'SUMMON' });
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.status).toBe('CALLED');
    expect(body.calledAt).toEqual(expect.any(Number));
    expect(body.calledAt!).toBeGreaterThanOrEqual(before);
    expect(body.calledAt!).toBeLessThanOrEqual(after);

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('CALLED');
    expect(row.called_at).toEqual(expect.any(Number));
    expect(row.called_at!).toBeGreaterThanOrEqual(before);
    expect(row.called_at!).toBeLessThanOrEqual(after);
  });

  it('HOLD: CALLED -> HELD and records held_at', async () => {
    const calledAt = Date.now() - 60_000;
    const ticket = await seedTicket(env.DB, {
      status: 'CALLED',
      calledAt,
      displayNumber: `A${MIDDLE_DOT}002`,
      seqNumber: 2,
    });

    const before = Date.now();
    const res = await patchHostAction(ticket.id, { action: 'HOLD' });
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.status).toBe('HELD');
    expect(body.heldAt).toEqual(expect.any(Number));
    expect(body.heldAt!).toBeGreaterThanOrEqual(before);
    expect(body.heldAt!).toBeLessThanOrEqual(after);

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('HELD');
    expect(row.held_at).toEqual(expect.any(Number));
    expect(row.called_at).toBe(calledAt);
  });

  it('SEAT: CALLED -> SEATED and updates rolling_turnover_mins via EMA', async () => {
    const waitMins = 30;
    const createdAt = Date.now() - waitMins * 60_000;
    const ticket = await seedTicket(env.DB, {
      status: 'CALLED',
      createdAt,
      calledAt: createdAt + 25 * 60_000,
      displayNumber: `A${MIDDLE_DOT}003`,
      seqNumber: 3,
      bucketId: BUCKET_A,
    });

    const oldTurnover = await getBucketTurnover(env.DB, BUCKET_A);
    expect(oldTurnover).toBe(20);

    const res = await patchHostAction(ticket.id, { action: 'SEAT' });
    expect(res.status).toBe(200);

    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.status).toBe('SEATED');
    expect(body.seatedAt).toEqual(expect.any(Number));

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('SEATED');
    expect(row.seated_at).toEqual(expect.any(Number));

    const actualWait = (row.seated_at! - row.created_at) / 60_000;
    expect(actualWait).toBeGreaterThanOrEqual(2);
    expect(actualWait).toBeLessThanOrEqual(180);

    const expected = Math.round(0.7 * oldTurnover + 0.3 * actualWait);
    const newTurnover = await getBucketTurnover(env.DB, BUCKET_A);
    expect(newTurnover).toBe(expected);
  });

  it('SEAT: ignores EMA update for outlier wait < 2 minutes', async () => {
    const createdAt = Date.now() - 60_000; // 1 minute
    const ticket = await seedTicket(env.DB, {
      status: 'CALLED',
      createdAt,
      calledAt: createdAt,
      displayNumber: `A${MIDDLE_DOT}004`,
      seqNumber: 4,
      bucketId: BUCKET_A,
    });

    const oldTurnover = await getBucketTurnover(env.DB, BUCKET_A);
    const res = await patchHostAction(ticket.id, { action: 'SEAT' });
    expect(res.status).toBe(200);

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('SEATED');
    expect(await getBucketTurnover(env.DB, BUCKET_A)).toBe(oldTurnover);
  });

  it('SEAT: ignores EMA update for outlier wait > 180 minutes', async () => {
    const createdAt = Date.now() - 200 * 60_000;
    const ticket = await seedTicket(env.DB, {
      status: 'CALLED',
      createdAt,
      calledAt: createdAt + 10 * 60_000,
      displayNumber: `A${MIDDLE_DOT}005`,
      seqNumber: 5,
      bucketId: BUCKET_A,
    });

    const oldTurnover = await getBucketTurnover(env.DB, BUCKET_A);
    const res = await patchHostAction(ticket.id, { action: 'SEAT' });
    expect(res.status).toBe(200);

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('SEATED');
    expect(await getBucketTurnover(env.DB, BUCKET_A)).toBe(oldTurnover);
  });

  it('BUMP_PRIORITY: sets priority_boost to MAX(priority_boost)+1 in bucket', async () => {
    const earlier = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}010`,
      seqNumber: 10,
      priorityBoost: 0,
      createdAt: Date.now() - 120_000,
      customerName: 'Earlier Guest',
    });
    const vip = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}011`,
      seqNumber: 11,
      priorityBoost: 0,
      createdAt: Date.now() - 30_000,
      customerName: 'VIP Guest',
    });
    await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}012`,
      seqNumber: 12,
      priorityBoost: 3,
      createdAt: Date.now() - 10_000,
      customerName: 'Already Boosted',
    });

    const res = await patchHostAction(vip.id, { action: 'BUMP_PRIORITY' });
    expect(res.status).toBe(200);

    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.priorityBoost).toBe(4); // MAX(3)+1
    expect(body.status).toBe('WAITING');
    expect(body.displayNumber).toBe(`A${MIDDLE_DOT}011`);

    const vipRow = await getTicket(env.DB, vip.id);
    expect(vipRow.priority_boost).toBe(4);
    expect(vipRow.status).toBe('WAITING');

    const ordered = await env.DB.prepare(
      `SELECT id FROM tickets
       WHERE branch_id = ? AND bucket_id = ? AND status = 'WAITING'
       ORDER BY priority_boost DESC, created_at ASC`,
    )
      .bind(BRANCH_ID, BUCKET_A)
      .all<{ id: string }>();

    const ids = (ordered.results ?? []).map((r) => r.id);
    expect(ids[0]).toBe(vip.id);
    expect(ids).toContain(earlier.id);
  });

  it('CHANGE_BUCKET: moves A·014 (2 pax) to Bucket B (4 pax), keeps display_number and created_at', async () => {
    const createdAt = Date.now() - 15 * 60_000;
    const displayNumber = `A${MIDDLE_DOT}014`;
    const ticket = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber,
      seqNumber: 14,
      paxCount: 2,
      bucketId: BUCKET_A,
      createdAt,
      customerName: 'Party Resize',
    });

    const res = await patchHostAction(ticket.id, {
      action: 'CHANGE_BUCKET',
      paxCount: 4,
      bucketId: BUCKET_B,
    });
    expect(res.status).toBe(200);

    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.displayNumber).toBe(displayNumber);
    expect(body.bucketId).toBe(BUCKET_B);
    expect(body.paxCount).toBe(4);
    expect(body.createdAt).toBe(createdAt);
    expect(body.status).toBe('WAITING');

    const row = await getTicket(env.DB, ticket.id);
    expect(row.display_number).toBe(displayNumber);
    expect(row.bucket_id).toBe(BUCKET_B);
    expect(row.pax_count).toBe(4);
    expect(row.created_at).toBe(createdAt);
    expect(row.status).toBe('WAITING');
  });

  it('CANCEL: WAITING -> CANCELLED and records cancelled_at', async () => {
    const ticket = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}020`,
      seqNumber: 20,
    });

    const before = Date.now();
    const res = await patchHostAction(ticket.id, { action: 'CANCEL' });
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = HostTicketActionResponseSchema.parse(await res.json());
    expect(body.status).toBe('CANCELLED');
    expect(body.cancelledAt).toEqual(expect.any(Number));
    expect(body.cancelledAt!).toBeGreaterThanOrEqual(before);
    expect(body.cancelledAt!).toBeLessThanOrEqual(after);

    const row = await getTicket(env.DB, ticket.id);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelled_at).toEqual(expect.any(Number));
  });

  it('returns 409 INVALID_TRANSITION for illegal SUMMON on SEATED', async () => {
    const ticket = await seedTicket(env.DB, {
      status: 'SEATED',
      seatedAt: Date.now() - 5_000,
      displayNumber: `A${MIDDLE_DOT}030`,
      seqNumber: 30,
    });

    const res = await patchHostAction(ticket.id, { action: 'SUMMON' });
    expect(res.status).toBe(409);
    const err = ApiErrorSchema.parse(await res.json());
    expect(err.code).toBe('INVALID_TRANSITION');
  });

  it('returns 409 INVALID_TRANSITION for illegal HOLD on WAITING', async () => {
    const ticket = await seedTicket(env.DB, {
      status: 'WAITING',
      displayNumber: `A${MIDDLE_DOT}031`,
      seqNumber: 31,
    });

    const res = await patchHostAction(ticket.id, { action: 'HOLD' });
    expect(res.status).toBe(409);
    const err = ApiErrorSchema.parse(await res.json());
    expect(err.code).toBe('INVALID_TRANSITION');
  });
});
