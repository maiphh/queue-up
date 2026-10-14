import { env } from 'cloudflare:test';
import {
  ApproachingTurnResultSchema,
  ZNS_APPROACHING_FEE_VND,
  ZnsApproachingDispatchSchema,
  znsApproachingIdempotencyKey,
  type ZnsApproachingDispatch,
} from '@luotdi/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZnsDispatcherService, type ZnsSender } from '../src/services';

/** Ensure worker main is loaded for watch re-runs. */
import '../src/index';

const MERCHANT_ID = 'merchant-zns-1';
const BRANCH_ID = 'branch-zns-1';
const BUCKET_A = 'bucket-zns-a';
/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';

const TICKET_A012_ID = 'ticket-a012';
const TICKET_A013_ID = 'ticket-a013';
const TICKET_A015_ID = 'ticket-a015';
const TICKET_A014_ID = 'ticket-a014';

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

type LedgerRow = {
  id: string;
  merchant_id: string;
  ticket_id: string | null;
  amount_vnd: number;
  tx_type: string;
  reference_code: string | null;
  created_at: number;
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

async function clearTables(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM tickets').run();
  await db.prepare('DELETE FROM wallet_ledger').run();
  await db.prepare('DELETE FROM queue_buckets').run();
  await db.prepare('DELETE FROM branches').run();
  await db.prepare('DELETE FROM merchants').run();
  await db.prepare('DELETE FROM staff_users').run();
}

async function seedMerchantBranchBucket(
  db: D1Database,
  opts: { walletBalanceVnd?: number } = {},
): Promise<void> {
  const now = Date.now();
  const wallet = opts.walletBalanceVnd ?? 1000;

  await db
    .prepare(
      `INSERT INTO merchants (
        id, name, slug, industry_type, plan_tier,
        monthly_ticket_count, wallet_balance_vnd, status, created_at
      ) VALUES (?, ?, ?, 'RESTAURANT', 'FREE', 0, ?, 'ACTIVE', ?)`,
    )
    .bind(MERCHANT_ID, 'ZNS Cafe', 'zns-cafe', wallet, now)
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
      'qr-zns-branch-1',
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO queue_buckets (
        id, branch_id, prefix, label_vi, label_en,
        min_pax, max_pax, active_counters, rolling_turnover_mins,
        current_seq, is_active
      ) VALUES (?, ?, 'A', '01-02 KHACH', '01-02 GUESTS', 1, 2, 4, 20, 0, 1)`,
    )
    .bind(BUCKET_A, BRANCH_ID)
    .run();
}

async function seedTicket(
  db: D1Database,
  opts: {
    id: string;
    displayNumber: string;
    seqNumber: number;
    status?: string;
    priorityBoost?: number;
    createdAt?: number;
    calledAt?: number | null;
    seatedAt?: number | null;
    zaloUserId?: string;
    customerName?: string;
  },
): Promise<TicketRow> {
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, 'QR_ONSITE', ?, ?, '[]', ?, ?, NULL, ?)`,
    )
    .bind(
      opts.id,
      BRANCH_ID,
      BUCKET_A,
      ticketDate,
      opts.seqNumber,
      opts.displayNumber,
      opts.zaloUserId ?? `zalo-${opts.id}`,
      opts.customerName ?? `Guest ${opts.displayNumber}`,
      opts.status ?? 'WAITING',
      opts.priorityBoost ?? 0,
      createdAt,
      opts.calledAt ?? null,
      opts.seatedAt ?? null,
    )
    .run();

  const row = await db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .bind(opts.id)
    .first<TicketRow>();
  if (!row) throw new Error(`seedTicket failed: ${opts.id}`);
  return row;
}

/**
 * Queue fixture for ApproachingTurn:
 * - A·012 CALLED (about to be / just seated) — trigger seat hook
 * - WAITING order (created_at ASC): A·013, A·015, A·014
 *   → after seat, A·014 has partiesAhead === 2 (index 2)
 */
async function seedApproachingQueue(db: D1Database): Promise<{
  seated: TicketRow;
  approaching: TicketRow;
}> {
  const base = Date.now() - 60_000;
  const seated = await seedTicket(db, {
    id: TICKET_A012_ID,
    displayNumber: `A${MIDDLE_DOT}012`,
    seqNumber: 12,
    status: 'CALLED',
    createdAt: base,
    calledAt: base + 50_000,
    customerName: 'Seated Guest',
  });
  await seedTicket(db, {
    id: TICKET_A013_ID,
    displayNumber: `A${MIDDLE_DOT}013`,
    seqNumber: 13,
    status: 'WAITING',
    createdAt: base + 1_000,
    customerName: 'Next Guest',
  });
  await seedTicket(db, {
    id: TICKET_A015_ID,
    displayNumber: `A${MIDDLE_DOT}015`,
    seqNumber: 15,
    status: 'WAITING',
    createdAt: base + 2_000,
    customerName: 'Middle Guest',
  });
  const approaching = await seedTicket(db, {
    id: TICKET_A014_ID,
    displayNumber: `A${MIDDLE_DOT}014`,
    seqNumber: 14,
    status: 'WAITING',
    createdAt: base + 3_000,
    customerName: 'Approaching Guest',
    zaloUserId: 'zalo-a014',
  });
  return { seated, approaching };
}

async function markSeated(db: D1Database, ticketId: string): Promise<void> {
  const seatedAt = Date.now();
  await db
    .prepare(
      `UPDATE tickets SET status = 'SEATED', seated_at = ? WHERE id = ?`,
    )
    .bind(seatedAt, ticketId)
    .run();
}

async function getWalletBalance(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT wallet_balance_vnd AS b FROM merchants WHERE id = ?')
    .bind(MERCHANT_ID)
    .first<{ b: number }>();
  if (!row) throw new Error('merchant not found');
  return row.b;
}

async function getLedgerByReference(
  db: D1Database,
  referenceCode: string,
): Promise<LedgerRow[]> {
  const result = await db
    .prepare('SELECT * FROM wallet_ledger WHERE reference_code = ?')
    .bind(referenceCode)
    .all<LedgerRow>();
  return result.results ?? [];
}

async function countLedger(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM wallet_ledger')
    .first<{ c: number }>();
  return row?.c ?? 0;
}

function createRecordingSender(): {
  sender: ZnsSender;
  dispatches: ZnsApproachingDispatch[];
} {
  const dispatches: ZnsApproachingDispatch[] = [];
  const sender: ZnsSender = {
    async sendApproachingTurn(payload) {
      dispatches.push(ZnsApproachingDispatchSchema.parse(payload));
    },
  };
  return { sender, dispatches };
}

describe('ZnsDispatcherService — ApproachingTurn wallet ledger', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
  });

  it('exports ApproachingTurn fee constant of 400 VND', () => {
    expect(ZNS_APPROACHING_FEE_VND).toBe(400);
  });

  it('builds idempotency key zns_approaching_${ticketId}', () => {
    expect(znsApproachingIdempotencyKey(TICKET_A014_ID)).toBe(
      `zns_approaching_${TICKET_A014_ID}`,
    );
  });

  it('onTicketSeated: when A·012 is seated, A·014 (2 spots away) deducts 400, ledger ZNS_CALL_ALERT, and dispatches ZNS', async () => {
    await seedMerchantBranchBucket(env.DB, { walletBalanceVnd: 1000 });
    const { seated, approaching } = await seedApproachingQueue(env.DB);
    await markSeated(env.DB, seated.id);

    const { sender, dispatches } = createRecordingSender();
    const dispatcher = new ZnsDispatcherService(env.DB, sender);

    const raw = await dispatcher.onTicketSeated(seated.id);
    const result = ApproachingTurnResultSchema.parse(raw);

    expect(result.notifiedTicketId).toBe(approaching.id);
    expect(result.charged).toBe(true);
    expect(result.skippedReason).toBeUndefined();

    expect(await getWalletBalance(env.DB)).toBe(1000 - ZNS_APPROACHING_FEE_VND);

    const idempotencyKey = znsApproachingIdempotencyKey(approaching.id);
    const ledger = await getLedgerByReference(env.DB, idempotencyKey);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.merchant_id).toBe(MERCHANT_ID);
    expect(ledger[0]!.ticket_id).toBe(approaching.id);
    expect(ledger[0]!.amount_vnd).toBe(-ZNS_APPROACHING_FEE_VND);
    expect(ledger[0]!.tx_type).toBe('ZNS_CALL_ALERT');
    expect(ledger[0]!.reference_code).toBe(idempotencyKey);
    expect(ledger[0]!.created_at).toEqual(expect.any(Number));

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      template: 'APPROACHING_TURN',
      merchantId: MERCHANT_ID,
      ticketId: approaching.id,
      displayNumber: `A${MIDDLE_DOT}014`,
      partiesAhead: 2,
    });
  });

  it('idempotent: second onTicketSeated / notifyApproachingTurn does not double-charge', async () => {
    await seedMerchantBranchBucket(env.DB, { walletBalanceVnd: 1000 });
    const { seated, approaching } = await seedApproachingQueue(env.DB);
    await markSeated(env.DB, seated.id);

    const { sender, dispatches } = createRecordingSender();
    const dispatcher = new ZnsDispatcherService(env.DB, sender);

    const first = ApproachingTurnResultSchema.parse(
      await dispatcher.onTicketSeated(seated.id),
    );
    expect(first.charged).toBe(true);
    expect(first.notifiedTicketId).toBe(approaching.id);

    const second = ApproachingTurnResultSchema.parse(
      await dispatcher.onTicketSeated(seated.id),
    );
    expect(second.charged).toBe(false);
    expect(second.skippedReason).toBe('ALREADY_SENT');
    expect(second.notifiedTicketId).toBe(approaching.id);

    const viaDirect = ApproachingTurnResultSchema.parse(
      await dispatcher.notifyApproachingTurn(approaching.id),
    );
    expect(viaDirect.charged).toBe(false);
    expect(viaDirect.skippedReason).toBe('ALREADY_SENT');

    expect(await getWalletBalance(env.DB)).toBe(1000 - ZNS_APPROACHING_FEE_VND);
    expect(await countLedger(env.DB)).toBe(1);
    expect(dispatches).toHaveLength(1);
  });

  it('skips ZNS and ledger debit when wallet_balance_vnd < 400 (WebSocket-only fallback)', async () => {
    await seedMerchantBranchBucket(env.DB, { walletBalanceVnd: 399 });
    const { seated } = await seedApproachingQueue(env.DB);
    await markSeated(env.DB, seated.id);

    const { sender, dispatches } = createRecordingSender();
    const dispatcher = new ZnsDispatcherService(env.DB, sender);

    const result = ApproachingTurnResultSchema.parse(
      await dispatcher.onTicketSeated(seated.id),
    );

    expect(result.charged).toBe(false);
    expect(result.skippedReason).toBe('INSUFFICIENT_WALLET');
    expect(result.notifiedTicketId).toBe(TICKET_A014_ID);

    expect(await getWalletBalance(env.DB)).toBe(399);
    expect(await countLedger(env.DB)).toBe(0);
    expect(dispatches).toHaveLength(0);
  });
});
