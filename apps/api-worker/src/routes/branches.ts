import { calculateEstimatedWait } from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import { assertBranchAccess, readActor } from '../services';

/**
 * Branch-scoped routes.
 * Specific paths must be registered before `/:branchId/ws`.
 */
const branches = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

type BranchJoinRow = {
  id: string;
  name: string;
  address: string;
  district: string;
  city: string;
  qr_code_token: string;
  routing_mode: string;
  is_paused: number;
  grace_period_mins: number;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  industry_type: string;
  plan_tier: string;
  wallet_balance_vnd: number;
};

type BucketRow = {
  id: string;
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

type TicketRow = {
  id: string;
  display_number: string;
  status: string;
  bucket_id: string;
  pax_count: number;
  customer_name: string;
  priority_boost: number;
  created_at: number;
  called_at: number | null;
  held_at: number | null;
  source?: string;
};

function marketplaceCategory(
  industryType: string,
  merchantSlug: string,
  merchantName: string,
): string {
  if (industryType === 'CLINIC') return 'CLINIC';
  const hay = `${merchantSlug} ${merchantName}`.toLowerCase();
  if (hay.includes('cafe') || hay.includes('coffee')) return 'CAFE';
  return industryType === 'SALON' ? 'SALON' : 'RESTAURANT';
}

async function loadBranchById(
  db: D1Database,
  branchId: string,
): Promise<BranchJoinRow | null> {
  return db
    .prepare(
      `SELECT b.id, b.name, b.address, b.district, b.city, b.qr_code_token,
              b.routing_mode, b.is_paused, b.grace_period_mins,
              m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
              m.industry_type, m.plan_tier, m.wallet_balance_vnd
       FROM branches b
       JOIN merchants m ON m.id = b.merchant_id
       WHERE b.id = ?1`,
    )
    .bind(branchId)
    .first<BranchJoinRow>();
}

async function loadBuckets(db: D1Database, branchId: string): Promise<BucketRow[]> {
  const result = await db
    .prepare(
      `SELECT id, prefix, label_vi, label_en, min_pax, max_pax,
              active_counters, rolling_turnover_mins, current_seq, is_active
       FROM queue_buckets
       WHERE branch_id = ?1 AND is_active = 1
       ORDER BY prefix ASC`,
    )
    .bind(branchId)
    .all<BucketRow>();
  return result.results ?? [];
}

async function countWaiting(
  db: D1Database,
  branchId: string,
  bucketId?: string,
): Promise<number> {
  if (bucketId) {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM tickets
         WHERE branch_id = ?1 AND bucket_id = ?2 AND status = 'WAITING'`,
      )
      .bind(branchId, bucketId)
      .first<{ c: number }>();
    return row?.c ?? 0;
  }
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM tickets
       WHERE branch_id = ?1 AND status = 'WAITING'`,
    )
    .bind(branchId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function bucketLiveMetrics(db: D1Database, branchId: string, bucket: BucketRow) {
  const partiesWaiting = await countWaiting(db, branchId, bucket.id);
  const estimatedWaitMins = calculateEstimatedWait({
    partiesAheadInBucket: partiesWaiting,
    activeCountersInBucket: Math.max(1, bucket.active_counters),
    rollingTurnoverMins: bucket.rolling_turnover_mins,
  });
  return { partiesWaiting, estimatedWaitMins };
}

/** GET /api/branches — marketplace list */
branches.get('/', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.district, b.qr_code_token,
            m.slug AS merchant_slug, m.name AS merchant_name, m.industry_type
     FROM branches b
     JOIN merchants m ON m.id = b.merchant_id
     WHERE m.status = 'ACTIVE'
     ORDER BY b.name ASC`,
  ).all<{
    id: string;
    name: string;
    district: string;
    qr_code_token: string;
    merchant_slug: string;
    merchant_name: string;
    industry_type: string;
  }>();

  const rows = result.results ?? [];
  const branchesOut = [];
  for (const row of rows) {
    const waitingCount = await countWaiting(c.env.DB, row.id);
    branchesOut.push({
      id: row.id,
      name: row.name,
      category: marketplaceCategory(
        row.industry_type,
        row.merchant_slug,
        row.merchant_name,
      ),
      waitingCount,
      district: row.district,
      qrToken: row.qr_code_token,
    });
  }

  return c.json({ branches: branchesOut });
});

/** GET /api/branches/by-qr/:qrToken — customer check-in */
branches.get('/by-qr/:qrToken', async (c) => {
  const qrToken = c.req.param('qrToken');
  const branch = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.address, b.district, b.city, b.qr_code_token,
            b.routing_mode, b.is_paused, b.grace_period_mins,
            m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
            m.industry_type, m.plan_tier, m.wallet_balance_vnd
     FROM branches b
     JOIN merchants m ON m.id = b.merchant_id
     WHERE b.qr_code_token = ?1`,
  )
    .bind(qrToken)
    .first<BranchJoinRow>();

  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const buckets = await loadBuckets(c.env.DB, branch.id);
  const bucketPayload = [];
  for (const bucket of buckets) {
    const live = await bucketLiveMetrics(c.env.DB, branch.id, bucket);
    bucketPayload.push({
      id: bucket.id,
      prefix: bucket.prefix,
      labelVi: bucket.label_vi,
      minPax: bucket.min_pax,
      maxPax: bucket.max_pax,
      partiesWaiting: live.partiesWaiting,
      estimatedWaitMins: live.estimatedWaitMins,
    });
  }

  const waitingTotal = await countWaiting(c.env.DB, branch.id);
  return c.json({
    waitingCount: waitingTotal,
    id: branch.id,
    name: branch.name,
    district: branch.district,
    city: branch.city,
    routingMode: branch.routing_mode,
    category: marketplaceCategory(
      branch.industry_type,
      branch.merchant_slug,
      branch.merchant_name,
    ),
    qrToken: branch.qr_code_token,
    isPaused: branch.is_paused === 1,
    buckets: bucketPayload,
  });
});

/** GET /api/branches/slug/:slug — TV kiosk (merchant slug → primary branch) */
branches.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const branch = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.address, b.district, b.city, b.qr_code_token,
            b.routing_mode, b.is_paused, b.grace_period_mins,
            m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
            m.industry_type, m.plan_tier, m.wallet_balance_vnd
     FROM branches b
     JOIN merchants m ON m.id = b.merchant_id
     WHERE m.slug = ?1
     ORDER BY b.created_at ASC
     LIMIT 1`,
  )
    .bind(slug)
    .first<BranchJoinRow>();

  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const buckets = await loadBuckets(c.env.DB, branch.id);
  const bucketPayload = [];
  for (const bucket of buckets) {
    const live = await bucketLiveMetrics(c.env.DB, branch.id, bucket);
    bucketPayload.push({
      id: bucket.id,
      prefix: bucket.prefix,
      labelVi: bucket.label_vi,
      partiesWaiting: live.partiesWaiting,
      estimatedWaitMins: live.estimatedWaitMins,
    });
  }

  return c.json({
    branchId: branch.id,
    branchSlug: branch.merchant_slug,
    branchName: branch.name,
    walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(branch.qr_code_token)}`,
    buckets: bucketPayload,
  });
});

/** GET /api/branches/:branchId/tv — TV for one branch (no LIMIT 1 by merchant) */
branches.get('/:branchId/tv', async (c) => {
  const branchId = c.req.param('branchId');
  const branch = await loadBranchById(c.env.DB, branchId);
  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const buckets = await loadBuckets(c.env.DB, branch.id);
  const bucketPayload = [];
  for (const bucket of buckets) {
    const live = await bucketLiveMetrics(c.env.DB, branch.id, bucket);
    bucketPayload.push({
      id: bucket.id,
      prefix: bucket.prefix,
      labelVi: bucket.label_vi,
      partiesWaiting: live.partiesWaiting,
      estimatedWaitMins: live.estimatedWaitMins,
    });
  }

  return c.json({
    branchId: branch.id,
    branchName: branch.name,
    branchSlug: branch.merchant_slug,
    walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(branch.qr_code_token)}`,
    buckets: bucketPayload,
  });
});

/** GET /api/branches/:branchId/snapshot — Host POS */
branches.get('/:branchId/snapshot', async (c) => {
  const branchId = c.req.param('branchId');
  const branch = await loadBranchById(c.env.DB, branchId);
  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const ticketResult = await c.env.DB.prepare(
    `SELECT id, display_number, status, bucket_id, pax_count, customer_name,
            priority_boost, created_at, called_at, held_at, source
     FROM tickets
     WHERE branch_id = ?1
       AND status IN ('WAITING', 'CALLED', 'HELD')
     ORDER BY
       CASE status WHEN 'CALLED' THEN 0 WHEN 'HELD' THEN 1 ELSE 2 END,
       priority_boost DESC,
       created_at ASC`,
  )
    .bind(branchId)
    .all<TicketRow>();

  const tickets = (ticketResult.results ?? []).map((t) => ({
    id: t.id,
    displayNumber: t.display_number,
    status: t.status,
    bucketId: t.bucket_id,
    paxCount: t.pax_count,
    customerName: t.customer_name,
    priorityBoost: t.priority_boost,
    createdAt: t.created_at,
    calledAt: t.called_at,
    heldAt: t.held_at,
    source: t.source ?? 'QR_ONSITE',
  }));

  const waiting = tickets.filter((t) => t.status === 'WAITING');
  const waitingCount = waiting.length;
  let avgWaitMins = 0;
  if (waiting.length > 0) {
    const now = Date.now();
    const sum = waiting.reduce((acc, t) => acc + (now - t.createdAt) / 60_000, 0);
    avgWaitMins = Math.round(sum / waiting.length);
  }

  // Call Console extras: bucket tabs + stats strip.
  const bucketRows = await loadBuckets(c.env.DB, branch.id);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const dayStats = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'SEATED' THEN 1 ELSE 0 END) AS served,
       SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
     FROM tickets WHERE branch_id = ?1 AND ticket_date = ?2`,
  )
    .bind(branchId, today)
    .first<{ served: number | null; cancelled: number | null }>();

  return c.json({
    buckets: bucketRows.map((b) => ({
      id: b.id,
      prefix: b.prefix,
      labelVi: b.label_vi,
      minPax: b.min_pax,
      maxPax: b.max_pax,
    })),
    stats: {
      servedToday: dayStats?.served ?? 0,
      cancelledToday: dayStats?.cancelled ?? 0,
      walletBalanceVnd: branch.wallet_balance_vnd,
    },
    graceMins: branch.grace_period_mins,
    branchId: branch.id,
    branchName: branch.name,
    waitingCount,
    avgWaitMins,
    queueStatus: branch.is_paused === 1 ? 'PAUSED' : 'OPEN',
    isPaused: branch.is_paused === 1,
    tickets,
  });
});

/** POST /api/branches/:branchId/pause — toggle pause */
branches.post('/:branchId/pause', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }

  const branchId = c.req.param('branchId');
  const branch = await loadBranchById(c.env.DB, branchId);
  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const access = await assertBranchAccess(
    c.env.DB,
    actorResult.actor,
    branchId,
  );
  if (access !== true) {
    return c.json(apiError('Insufficient staff role', access.code), access.status);
  }

  let nextPaused = branch.is_paused === 1 ? 0 : 1;
  try {
    const body = await c.req.json<{ paused?: boolean }>();
    if (typeof body.paused === 'boolean') {
      nextPaused = body.paused ? 1 : 0;
    }
  } catch {
    /* toggle if no/invalid body */
  }

  await c.env.DB.prepare(`UPDATE branches SET is_paused = ?1 WHERE id = ?2`)
    .bind(nextPaused, branchId)
    .run();

  return c.json({
    branchId,
    isPaused: nextPaused === 1,
    queueStatus: nextPaused === 1 ? 'PAUSED' : 'OPEN',
  });
});

/** GET /api/branches/:branchId/ws — Durable Object upgrade */
branches.get('/:branchId/ws', async (c) => {
  const upgrade = c.req.header('Upgrade');
  if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const branchId = c.req.param('branchId');
  const id = c.env.BRANCH_QUEUE_ROOM.idFromName(branchId);
  const stub = c.env.BRANCH_QUEUE_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

export { branches };
