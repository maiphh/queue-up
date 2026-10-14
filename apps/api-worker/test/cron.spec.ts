import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailyResetCron, sweepExpiredHolds } from '../src/services';

/** Ensure worker main is loaded for watch re-runs / scheduled export. */
import '../src/index';

const MERCHANT_ID = 'merchant-1';
const BRANCH_ID = 'branch-1';
const BUCKET_A = 'bucket-a';
const BUCKET_B = 'bucket-b';
/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';
/** Default branch grace period used by seed (minutes). */
const GRACE_PERIOD_MINS = 10;

type TicketRow = {
  id: string;
  branch_id: string;
  bucket_id: string;
  ticket_date: string;
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

function ticketDateVietnam(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

/** Yesterday's calendar date in Asia/Ho_Chi_Minh (UTC+7). */
function yesterdayVietnam(nowMs: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  return ticketDateVietnam(nowMs - dayMs);
}

async function applySchema(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

async function clearTables(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM tickets').run();
  await db.prepare('DELETE FROM wallet_ledger').run();
  await db.prepare('DELETE FROM queue_buckets').run();
  await db.prepare('DELETE FROM branches').run();
  await db.prepare('DELETE FROM merchants').run();
  await db.prepare('DELETE FROM staff_users').run();
}

async function seedMerchantBranchBuckets(
  db: D1Database,
  opts: { gracePeriodMins?: number } = {},
): Promise<void> {
  const now = Date.now();
  const grace = opts.gracePeriodMins ?? GRACE_PERIOD_MINS;

  await db
    .prepare(
      `INSERT INTO merchants (
        id, name, slug, industry_type, plan_tier,
        monthly_ticket_count, wallet_balance_vnd, status, created_at
      ) VALUES (?, ?, ?, 'RESTAURANT', 'FREE', 0, 0, 'ACTIVE', ?)`,
    )
    .bind(MERCHANT_ID, 'Cafe Test', 'cafe-test', now)
    .run();

  await db
    .prepare(
      `INSERT INTO branches (
        id, merchant_id, name, address, district, city,
        qr_code_token, routing_mode, allow_remote_queue, is_paused,
        grace_period_mins, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, ?, ?)`,
    )
    .bind(
      BRANCH_ID,
      MERCHANT_ID,
      'District 1',
      '1 Nguyen Hue',
      'Quan 1',
      'qr-branch-1',
      grace,
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
      currentSeq: 0,
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
      currentSeq: 0,
    },
  ];

  for (const b of buckets) {
    await db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
        b.currentSeq,
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
    ticketDate?: string;
    calledAt?: number | null;
    heldAt?: number | null;
    seatedAt?: number | null;
    cancelledAt?: number | null;
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
  const ticketDate = opts.ticketDate ?? ticketDateVietnam(createdAt);

  await db
    .prepare(
      `INSERT INTO tickets (
        id, branch_id, bucket_id, ticket_date, seq_number, display_number,
        zalo_user_id, customer_name, pax_count, source, status,
        priority_boost, preferences_json, created_at,
        called_at, held_at, seated_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'QR_ONSITE', ?, ?, '[]', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      BRANCH_ID,
      bucketId,
      ticketDate,
      seqNumber,
      displayNumber,
      opts.zaloUserId ?? null,
      opts.customerName ?? 'Cron Guest',
      opts.paxCount ?? 2,
      opts.status ?? 'WAITING',
      opts.priorityBoost ?? 0,
      createdAt,
      opts.calledAt ?? null,
      opts.heldAt ?? null,
      opts.seatedAt ?? null,
      opts.cancelledAt ?? null,
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

async function getBucketSeq(db: D1Database, bucketId: string): Promise<number> {
  const row = await db
    .prepare('SELECT current_seq AS s FROM queue_buckets WHERE id = ?')
    .bind(bucketId)
    .first<{ s: number }>();
  if (!row) throw new Error(`bucket not found: ${bucketId}`);
  return row.s;
}

async function setBucketSeq(
  db: D1Database,
  bucketId: string,
  seq: number,
): Promise<void> {
  await db
    .prepare('UPDATE queue_buckets SET current_seq = ? WHERE id = ?')
    .bind(seq, bucketId)
    .run();
}

describe('sweepExpiredHolds()', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB);
  });

  it('cancels HELD tickets past branch.grace_period_mins and leaves in-grace HELD tickets', async () => {
    const nowMs = Date.now();
    const graceMs = GRACE_PERIOD_MINS * 60_000;

    const expired = await seedTicket(env.DB, {
      id: 'held-expired',
      status: 'HELD',
      seqNumber: 1,
      displayNumber: `A${MIDDLE_DOT}001`,
      createdAt: nowMs - graceMs - 120_000,
      calledAt: nowMs - graceMs - 90_000,
      // Past grace: now - held_at > grace_period_mins * 60_000
      heldAt: nowMs - graceMs - 1_000,
    });

    const withinGrace = await seedTicket(env.DB, {
      id: 'held-within',
      status: 'HELD',
      seqNumber: 2,
      displayNumber: `A${MIDDLE_DOT}002`,
      createdAt: nowMs - 5 * 60_000,
      calledAt: nowMs - 4 * 60_000,
      // Still inside grace window
      heldAt: nowMs - 5 * 60_000,
    });

    const result = await sweepExpiredHolds(env.DB, nowMs);

    expect(result.cancelledCount).toBeGreaterThanOrEqual(1);

    const afterExpired = await getTicket(env.DB, expired.id);
    expect(afterExpired.status).toBe('CANCELLED');
    expect(afterExpired.cancelled_at).toEqual(expect.any(Number));
    expect(afterExpired.cancelled_at!).toBeGreaterThan(0);

    const afterWithin = await getTicket(env.DB, withinGrace.id);
    expect(afterWithin.status).toBe('HELD');
    expect(afterWithin.held_at).toBe(withinGrace.held_at);
    expect(afterWithin.cancelled_at).toBeNull();
  });

  it('uses per-branch grace_period_mins when deciding expiry', async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB, { gracePeriodMins: 5 });

    const nowMs = Date.now();
    const fiveMinMs = 5 * 60_000;

    const pastCustomGrace = await seedTicket(env.DB, {
      id: 'held-custom-grace',
      status: 'HELD',
      seqNumber: 1,
      createdAt: nowMs - 6 * 60_000,
      calledAt: nowMs - fiveMinMs - 60_000,
      heldAt: nowMs - fiveMinMs - 500,
    });

    await sweepExpiredHolds(env.DB, nowMs);

    const after = await getTicket(env.DB, pastCustomGrace.id);
    expect(after.status).toBe('CANCELLED');
  });
});

describe('dailyResetCron()', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB);
  });

  it('resets current_seq to 0 and cancels prior-date unclosed tickets', async () => {
    const nowMs = Date.now();
    const today = ticketDateVietnam(nowMs);
    const priorDate = yesterdayVietnam(nowMs);

    await setBucketSeq(env.DB, BUCKET_A, 42);
    await setBucketSeq(env.DB, BUCKET_B, 17);

    const waitingPrior = await seedTicket(env.DB, {
      id: 'prior-waiting',
      status: 'WAITING',
      ticketDate: priorDate,
      createdAt: nowMs - 26 * 60 * 60 * 1000,
      seqNumber: 1,
      displayNumber: `A${MIDDLE_DOT}001`,
    });

    const calledPrior = await seedTicket(env.DB, {
      id: 'prior-called',
      status: 'CALLED',
      ticketDate: priorDate,
      createdAt: nowMs - 26 * 60 * 60 * 1000,
      calledAt: nowMs - 25 * 60 * 60 * 1000,
      seqNumber: 2,
      displayNumber: `A${MIDDLE_DOT}002`,
    });

    const heldPrior = await seedTicket(env.DB, {
      id: 'prior-held',
      status: 'HELD',
      ticketDate: priorDate,
      createdAt: nowMs - 26 * 60 * 60 * 1000,
      calledAt: nowMs - 25 * 60 * 60 * 1000,
      heldAt: nowMs - 24 * 60 * 60 * 1000,
      seqNumber: 3,
      displayNumber: `A${MIDDLE_DOT}003`,
    });

    const seatedPrior = await seedTicket(env.DB, {
      id: 'prior-seated',
      status: 'SEATED',
      ticketDate: priorDate,
      createdAt: nowMs - 27 * 60 * 60 * 1000,
      seatedAt: nowMs - 26 * 60 * 60 * 1000,
      seqNumber: 4,
      displayNumber: `A${MIDDLE_DOT}004`,
    });

    const cancelledPrior = await seedTicket(env.DB, {
      id: 'prior-cancelled',
      status: 'CANCELLED',
      ticketDate: priorDate,
      createdAt: nowMs - 27 * 60 * 60 * 1000,
      cancelledAt: nowMs - 26 * 60 * 60 * 1000,
      seqNumber: 5,
      displayNumber: `A${MIDDLE_DOT}005`,
    });

    const waitingToday = await seedTicket(env.DB, {
      id: 'today-waiting',
      status: 'WAITING',
      ticketDate: today,
      createdAt: nowMs - 30 * 60_000,
      seqNumber: 10,
      displayNumber: `A${MIDDLE_DOT}010`,
      bucketId: BUCKET_A,
    });

    const result = await dailyResetCron(env.DB, nowMs);

    expect(result.resetBuckets).toBeGreaterThanOrEqual(2);
    expect(result.cancelledTickets).toBeGreaterThanOrEqual(3);

    expect(await getBucketSeq(env.DB, BUCKET_A)).toBe(0);
    expect(await getBucketSeq(env.DB, BUCKET_B)).toBe(0);

    expect((await getTicket(env.DB, waitingPrior.id)).status).toBe('CANCELLED');
    expect((await getTicket(env.DB, calledPrior.id)).status).toBe('CANCELLED');
    expect((await getTicket(env.DB, heldPrior.id)).status).toBe('CANCELLED');

    for (const id of [waitingPrior.id, calledPrior.id, heldPrior.id]) {
      const row = await getTicket(env.DB, id);
      expect(row.cancelled_at).toEqual(expect.any(Number));
      expect(row.cancelled_at!).toBeGreaterThan(0);
    }

    expect((await getTicket(env.DB, seatedPrior.id)).status).toBe('SEATED');
    expect((await getTicket(env.DB, cancelledPrior.id)).status).toBe(
      'CANCELLED',
    );
    expect((await getTicket(env.DB, cancelledPrior.id)).cancelled_at).toBe(
      cancelledPrior.cancelled_at,
    );

    expect((await getTicket(env.DB, waitingToday.id)).status).toBe('WAITING');
    expect((await getTicket(env.DB, waitingToday.id)).cancelled_at).toBeNull();
  });
});
