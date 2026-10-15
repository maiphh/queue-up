import {
  CreateTicketRequestSchema,
  calculateEstimatedWait,
  resolveBucket,
  type Bucket,
  type CreateTicketResponse,
} from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index'; // type-only — avoid runtime cycle with route mount
import { readGuestBearer } from '../services/jwt';
import { pauseReason } from '../services/branch-hours';

const MIDDLE_DOT = '\u00B7';

type BranchRow = {
  id: string;
  merchant_id: string;
  routing_mode: 'PARTY_SIZE' | 'SERVICE_TYPE';
  is_paused: number;
  allow_remote_queue?: number;
  open_time?: string | null;
  close_time?: string | null;
  auto_pause_wait_mins?: number | null;
};

type MerchantRow = {
  id: string;
  plan_tier: string;
  monthly_ticket_count: number;
};

type BucketRow = {
  id: string;
  branch_id: string;
  prefix: string;
  label_vi: string;
  label_en: string;
  min_pax: number;
  max_pax: number;
  active_counters: number;
  rolling_turnover_mins: number;
  current_seq: number;
  is_active: number;
};

type SeqBumpRow = {
  current_seq: number;
  prefix: string;
  active_counters: number;
  rolling_turnover_mins: number;
};

function apiError(error: string, code: string) {
  return { error, code };
}

/** Calendar date YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7, no DST). */
function ticketDateVietnam(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

function formatDisplayNumber(prefix: string, seq: number): string {
  return `${prefix}${MIDDLE_DOT}${String(seq).padStart(3, '0')}`;
}

function toBucket(row: BucketRow): Bucket {
  return {
    id: row.id,
    branchId: row.branch_id,
    prefix: row.prefix,
    labelVi: row.label_vi,
    labelEn: row.label_en,
    minPax: row.min_pax,
    maxPax: row.max_pax,
    activeCounters: row.active_counters,
    rollingTurnoverMins: row.rolling_turnover_mins,
    currentSeq: row.current_seq,
    isActive: row.is_active === 1,
  };
}

const tickets = new Hono<{ Bindings: Env }>();

/** GET /api/tickets/:id — live pass screen */
tickets.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT t.id, t.display_number, t.status, t.branch_id, t.bucket_id,
            t.pax_count, t.created_at, t.priority_boost, t.called_at,
            b.name AS branch_name, b.grace_period_mins, b.is_paused,
            bk.prefix AS bucket_prefix, bk.label_vi AS bucket_label_vi,
            bk.active_counters, bk.rolling_turnover_mins
     FROM tickets t
     JOIN branches b ON b.id = t.branch_id
     JOIN queue_buckets bk ON bk.id = t.bucket_id
     WHERE t.id = ?1`,
  )
    .bind(id)
    .first<{
      id: string;
      display_number: string;
      status: string;
      branch_id: string;
      bucket_id: string;
      pax_count: number;
      created_at: number;
      priority_boost: number;
      called_at: number | null;
      branch_name: string;
      grace_period_mins: number;
      is_paused: number;
      bucket_prefix: string;
      bucket_label_vi: string;
      active_counters: number;
      rolling_turnover_mins: number;
    }>();

  if (!row) {
    return c.json(apiError('Ticket not found', 'TICKET_NOT_FOUND'), 404);
  }

  const aheadRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS c FROM tickets
     WHERE branch_id = ?1 AND bucket_id = ?2 AND status = 'WAITING'
       AND (
         priority_boost > ?3
         OR (priority_boost = ?3 AND created_at < ?4)
         OR (priority_boost = ?3 AND created_at = ?4 AND id < ?5)
       )`,
  )
    .bind(
      row.branch_id,
      row.bucket_id,
      row.priority_boost,
      row.created_at,
      row.id,
    )
    .first<{ c: number }>();

  const partiesAhead =
    row.status === 'WAITING' ? (aheadRow?.c ?? 0) : 0;

  const nowServingRow = await c.env.DB.prepare(
    `SELECT display_number FROM tickets
     WHERE branch_id = ?1 AND bucket_id = ?2 AND status = 'CALLED'
     ORDER BY called_at DESC LIMIT 1`,
  )
    .bind(row.branch_id, row.bucket_id)
    .first<{ display_number: string }>();

  const estimatedWaitMins =
    row.status === 'WAITING'
      ? calculateEstimatedWait({
          partiesAheadInBucket: partiesAhead,
          activeCountersInBucket: Math.max(1, row.active_counters),
          rollingTurnoverMins: row.rolling_turnover_mins,
        })
      : 0;

  return c.json({
    id: row.id,
    displayNumber: row.display_number,
    status: row.status,
    branchId: row.branch_id,
    branchName: row.branch_name,
    bucketId: row.bucket_id,
    paxCount: row.pax_count,
    bucketPrefix: row.bucket_prefix,
    bucketLabelVi: row.bucket_label_vi,
    calledAt: row.called_at,
    graceMins: row.grace_period_mins,
    isPaused: row.is_paused === 1,
    nowServing: nowServingRow?.display_number ?? '—',
    partiesAhead,
    estimatedWaitMins,
  });
});

tickets.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON body', 'INVALID_BODY'), 400);
  }

  const parsed = CreateTicketRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(apiError('Invalid request body', 'INVALID_BODY'), 400);
  }

  const req = parsed.data;
  const db = c.env.DB;

  // Guest identity comes ONLY from a verified JWT (POST /api/auth/zalo).
  // A client-sent zaloUserId is never trusted (stripped by the schema).
  // No Authorization header = anonymous ticket (no per-user dedupe);
  // a present-but-invalid/expired token is rejected.
  const bearer = await readGuestBearer(
    c.req.header('Authorization'),
    c.env.JWT_SECRET,
  );
  if (bearer.kind === 'invalid') {
    return c.json(apiError('Invalid or expired session', 'UNAUTHORIZED'), 401);
  }
  const zaloUserId = bearer.kind === 'ok' ? bearer.claims.zid : null;

  const branch = await db
    .prepare(
      `SELECT id, merchant_id, routing_mode, is_paused, allow_remote_queue,
              open_time, close_time, auto_pause_wait_mins
       FROM branches WHERE id = ?1`,
    )
    .bind(req.branchId)
    .first<BranchRow>();

  if (!branch) {
    return c.json(apiError('Branch not found', 'BRANCH_NOT_FOUND'), 404);
  }

  const merchant = await db
    .prepare(
      `SELECT id, plan_tier, monthly_ticket_count
       FROM merchants WHERE id = ?1`,
    )
    .bind(branch.merchant_id)
    .first<MerchantRow>();

  if (!merchant) {
    return c.json(apiError('Merchant not found', 'MERCHANT_NOT_FOUND'), 404);
  }

  // Manual pause, outside opening hours, or wait above the Manager's limit (Cài đặt quầy).
  let maxWait = 0;
  if (branch.auto_pause_wait_mins) {
    const w = await db
      .prepare(
        `SELECT q.active_counters, q.rolling_turnover_mins,
                (SELECT COUNT(*) FROM tickets t WHERE t.bucket_id = q.id AND t.status = 'WAITING') AS waiting
         FROM queue_buckets q WHERE q.branch_id = ?1 AND q.is_active = 1`,
      )
      .bind(branch.id)
      .all<{ active_counters: number; rolling_turnover_mins: number; waiting: number }>();
    for (const b of w.results ?? []) {
      if (b.waiting > 0) {
        maxWait = Math.max(maxWait, Math.ceil((b.waiting + 1) / Math.max(1, b.active_counters)) * b.rolling_turnover_mins);
      }
    }
  }
  if (pauseReason(branch, Date.now(), maxWait) !== null) {
    return c.json(apiError('Queue is paused', 'QUEUE_PAUSED'), 423);
  }

  if (req.source === 'MARKETPLACE' && branch.allow_remote_queue === 0) {
    return c.json(apiError('Remote queue is off for this branch', 'REMOTE_QUEUE_DISABLED'), 423);
  }

  if (merchant.plan_tier === 'FREE' && merchant.monthly_ticket_count >= 200) {
    return c.json(
      apiError('Free monthly ticket quota exceeded', 'FREE_QUOTA_EXCEEDED'),
      402,
    );
  }

  if (zaloUserId) {
    const active = await db
      .prepare(
        `SELECT id, display_number FROM tickets
         WHERE branch_id = ?1
           AND zalo_user_id = ?2
           AND status IN ('WAITING', 'CALLED', 'HELD')
         LIMIT 1`,
      )
      .bind(req.branchId, zaloUserId)
      .first<{ id: string; display_number: string }>();

    if (active) {
      // The guest screen pins this ticket with "Xem số của tôi".
      return c.json(
        {
          ...apiError('Active ticket already exists for this user', 'ACTIVE_TICKET_EXISTS'),
          activeTicket: { id: active.id, displayNumber: active.display_number },
        },
        409,
      );
    }
  }

  const bucketRows = await db
    .prepare(
      `SELECT id, branch_id, prefix, label_vi, label_en,
              min_pax, max_pax, active_counters, rolling_turnover_mins,
              current_seq, is_active
       FROM queue_buckets WHERE branch_id = ?1`,
    )
    .bind(req.branchId)
    .all<BucketRow>();

  const buckets = (bucketRows.results ?? []).map(toBucket);
  if (buckets.length === 0) {
    return c.json(apiError('No queue buckets configured', 'NO_BUCKETS'), 404);
  }

  let bucket: Bucket;
  try {
    bucket = resolveBucket({
      routingMode: branch.routing_mode,
      buckets,
      paxCount: req.paxCount,
      bucketId: req.bucketId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to resolve bucket';
    return c.json(apiError(message, 'BUCKET_RESOLVE_FAILED'), 400);
  }

  const aheadRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM tickets
       WHERE branch_id = ?1 AND bucket_id = ?2 AND status = 'WAITING'`,
    )
    .bind(req.branchId, bucket.id)
    .first<{ cnt: number }>();
  const partiesAhead = aheadRow?.cnt ?? 0;

  const ticketId = crypto.randomUUID();
  const createdAt = Date.now();
  const ticketDate = ticketDateVietnam(createdAt);
  const source = req.source ?? 'QR_ONSITE';
  const paxCount = req.paxCount ?? 2;

  // Atomic seq: UPDATE RETURNING then INSERT using same-transaction current_seq.
  // Avoids SELECT MAX(seq)+1 races under concurrent QR scans.
  const batchResults = await db.batch([
    db
      .prepare(
        `UPDATE queue_buckets
         SET current_seq = current_seq + 1
         WHERE id = ?1 AND branch_id = ?2 AND is_active = 1
         RETURNING current_seq, prefix, active_counters, rolling_turnover_mins`,
      )
      .bind(bucket.id, req.branchId),
    db
      .prepare(
        `INSERT INTO tickets (
           id, branch_id, bucket_id, ticket_date, seq_number, display_number,
           zalo_user_id, customer_name, pax_count, source, status,
           priority_boost, preferences_json, created_at
         )
         SELECT
           ?1, ?2, qb.id, ?3, qb.current_seq,
           qb.prefix || char(183) || printf('%03d', qb.current_seq),
           ?4, ?5, ?6, ?7, 'WAITING',
           0, '[]', ?8
         FROM queue_buckets qb
         WHERE qb.id = ?9 AND qb.branch_id = ?2 AND qb.is_active = 1`,
      )
      .bind(
        ticketId,
        req.branchId,
        ticketDate,
        zaloUserId,
        req.customerName,
        paxCount,
        source,
        createdAt,
        bucket.id,
      ),
    db
      .prepare(
        `UPDATE merchants
         SET monthly_ticket_count = monthly_ticket_count + 1
         WHERE id = ?1`,
      )
      .bind(merchant.id),
  ]);

  const bump = batchResults[0]?.results?.[0] as SeqBumpRow | undefined;
  const insertChanges = batchResults[1]?.meta?.changes ?? 0;

  if (!bump || insertChanges < 1) {
    return c.json(apiError('Failed to issue ticket', 'ISSUE_FAILED'), 500);
  }

  const seqNumber = bump.current_seq;
  const displayNumber = formatDisplayNumber(bump.prefix, seqNumber);
  const estimatedWaitMins = calculateEstimatedWait({
    partiesAheadInBucket: partiesAhead,
    activeCountersInBucket: bump.active_counters,
    rollingTurnoverMins: bump.rolling_turnover_mins,
  });

  const response: CreateTicketResponse = {
    id: ticketId,
    displayNumber,
    status: 'WAITING',
    bucketId: bucket.id,
    seqNumber,
    estimatedWaitMins,
  };

  return c.json(response, 200);
});

export { tickets };

/**
 * POST /api/tickets/:id/cancel — the guest who owns the ticket gives up
 * ("Không đến được nữa · Hủy số"). Only the JWT owner, only while open.
 */
tickets.post('/:id/cancel', async (c) => {
  const bearer = await readGuestBearer(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (bearer.kind !== 'ok') {
    return c.json(apiError('Sign in required', 'UNAUTHORIZED'), 401);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, status, zalo_user_id FROM tickets WHERE id = ?1`,
  )
    .bind(c.req.param('id'))
    .first<{ id: string; status: string; zalo_user_id: string | null }>();
  if (!row || row.zalo_user_id !== bearer.claims.zid) {
    return c.json(apiError('Ticket not found', 'TICKET_NOT_FOUND'), 404);
  }
  if (!['WAITING', 'CALLED', 'HELD'].includes(row.status)) {
    return c.json(apiError('Ticket is no longer open', 'INVALID_TRANSITION'), 409);
  }
  await c.env.DB.prepare(
    `UPDATE tickets SET status = 'CANCELLED', cancelled_at = ?1 WHERE id = ?2`,
  )
    .bind(Date.now(), row.id)
    .run();
  return c.json({ id: row.id, status: 'CANCELLED' });
});
