import { calculateEstimatedWait } from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import { assertBranchAccess, pauseReason, readActor } from '../services';
import { readGuestBearer } from '../services/jwt';

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
  slug?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  auto_pause_wait_mins?: number | null;
  shortcuts_enabled?: number;
  tv_tts?: number;
  tv_voice?: string;
  tv_chime?: number;
  tv_mascot?: number;
  tv_static?: number;
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

const BRANCH_COLS = `b.id, b.name, b.address, b.district, b.city, b.qr_code_token,
              b.routing_mode, b.is_paused, b.grace_period_mins, b.slug,
              b.open_time, b.close_time, b.auto_pause_wait_mins, b.shortcuts_enabled,
              b.tv_tts, b.tv_voice, b.tv_chime, b.tv_mascot, b.tv_static,
              m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
              m.industry_type, m.plan_tier, m.wallet_balance_vnd`;

/** Calendar date YYYY-MM-DD in Asia/Ho_Chi_Minh. */
function vnDate(nowMs = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
}

function walkInQrUrl(qrToken: string): string {
  return `https://zalo.me/app/link?qr=${encodeURIComponent(qrToken)}`;
}

/**
 * TV payload. Numbers only (no guest names/phones). `nowServing` = latest CALLED
 * ticket so a freshly loaded TV is not blank; `recent` = the 3 calls before it today;
 * `buckets[].next` = next 3 WAITING numbers in call order.
 */
async function buildTvPayload(db: D1Database, branch: BranchJoinRow) {
  const buckets = await loadBuckets(db, branch.id);
  const bucketPayload = [];
  for (const bucket of buckets) {
    const live = await bucketLiveMetrics(db, branch.id, bucket);
    const next = await db
      .prepare(
        `SELECT display_number FROM tickets
         WHERE branch_id = ?1 AND bucket_id = ?2 AND status = 'WAITING'
         ORDER BY priority_boost DESC, created_at ASC LIMIT 3`,
      )
      .bind(branch.id, bucket.id)
      .all<{ display_number: string }>();
    bucketPayload.push({
      id: bucket.id,
      prefix: bucket.prefix,
      labelVi: bucket.label_vi,
      minPax: bucket.min_pax,
      maxPax: bucket.max_pax,
      partiesWaiting: live.partiesWaiting,
      estimatedWaitMins: live.partiesWaiting > 0 ? live.estimatedWaitMins : 0,
      next: (next.results ?? []).map((r) => r.display_number),
    });
  }

  const today = vnDate();
  const called = await db
    .prepare(
      `SELECT t.display_number, t.status, t.called_at, q.prefix, q.label_vi, q.min_pax, q.max_pax
       FROM tickets t JOIN queue_buckets q ON q.id = t.bucket_id
       WHERE t.branch_id = ?1 AND t.ticket_date = ?2 AND t.called_at IS NOT NULL
       ORDER BY t.called_at DESC LIMIT 4`,
    )
    .bind(branch.id, today)
    .all<{
      display_number: string; status: string; called_at: number;
      prefix: string; label_vi: string; min_pax: number; max_pax: number;
    }>();
  const calls = called.results ?? [];
  const head = calls[0] && calls[0].status === 'CALLED' ? calls[0] : null;
  const served = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM tickets WHERE branch_id = ?1 AND ticket_date = ?2 AND status = 'SEATED'`,
    )
    .bind(branch.id, today)
    .first<{ c: number }>();

  return {
    branchId: branch.id,
    branchName: branch.name,
    branchSlug: branch.slug ?? branch.merchant_slug,
    merchantSlug: branch.merchant_slug,
    merchantName: branch.merchant_name,
    address: branch.address,
    district: branch.district,
    routingMode: branch.routing_mode,
    industryType: branch.industry_type,
    isPaused: pauseReason(branch, Date.now(), Math.max(0, ...bucketPayload.map((b) => b.estimatedWaitMins))) !== null,
    pauseReason: pauseReason(branch, Date.now(), Math.max(0, ...bucketPayload.map((b) => b.estimatedWaitMins))),
    servedToday: served?.c ?? 0,
    tv: {
      tts: branch.tv_tts !== 0,
      voice: branch.tv_voice ?? 'female-south',
      chime: branch.tv_chime !== 0,
      mascot: branch.tv_mascot !== 0,
      staticMode: branch.tv_static === 1,
    },
    walkInQrUrl: walkInQrUrl(branch.qr_code_token),
    nowServing: head
      ? {
          displayNumber: head.display_number,
          bucketPrefix: head.prefix,
          bucketLabelVi: head.label_vi,
          minPax: head.min_pax,
          maxPax: head.max_pax,
          calledAt: head.called_at,
        }
      : null,
    recent: calls
      .slice(head ? 1 : 0)
      .slice(0, 3)
      .map((r) => ({ displayNumber: r.display_number, calledAt: r.called_at })),
    buckets: bucketPayload,
  };
}

async function loadBranchById(
  db: D1Database,
  branchId: string,
): Promise<BranchJoinRow | null> {
  return db
    .prepare(
      `SELECT ${BRANCH_COLS}
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

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * GET /api/branches — marketplace list.
 * `?lat=&lng=` (only after the guest grants Zalo location) adds `distanceM` and sorts nearest first.
 * A guest Bearer adds `activeTicket` (the pinned card).
 */
branches.get('/', async (c) => {
  const lat = Number.parseFloat(c.req.query('lat') ?? '');
  const lng = Number.parseFloat(c.req.query('lng') ?? '');
  const here = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

  const result = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.district, b.address, b.qr_code_token, b.lat, b.lng,
            b.is_paused, b.open_time, b.close_time, b.auto_pause_wait_mins, b.allow_remote_queue,
            m.slug AS merchant_slug, m.name AS merchant_name, m.industry_type
     FROM branches b
     JOIN merchants m ON m.id = b.merchant_id
     WHERE m.status = 'ACTIVE'
     ORDER BY b.name ASC`,
  ).all<{
    id: string; name: string; district: string; address: string; qr_code_token: string;
    lat: number | null; lng: number | null; is_paused: number; open_time: string | null; close_time: string | null;
    auto_pause_wait_mins: number | null; allow_remote_queue: number;
    merchant_slug: string; merchant_name: string; industry_type: string;
  }>();

  const now = Date.now();
  const branchesOut = [];
  for (const row of result.results ?? []) {
    const buckets = await loadBuckets(c.env.DB, row.id);
    const waits = [];
    for (const bk of buckets) waits.push((await bucketLiveMetrics(c.env.DB, row.id, bk)).estimatedWaitMins);
    const waitingCount = await countWaiting(c.env.DB, row.id);
    const reason = pauseReason(row, now, Math.max(0, ...waits));
    branchesOut.push({
      id: row.id,
      name: row.name,
      merchantName: row.merchant_name,
      category: marketplaceCategory(row.industry_type, row.merchant_slug, row.merchant_name),
      waitingCount,
      /** Shortest bucket wait ("~14 phút"); null when the branch has no open bucket. */
      estimatedWaitMins: waits.length ? Math.min(...waits) : null,
      district: row.district,
      address: row.address,
      qrToken: row.qr_code_token,
      isPaused: reason !== null,
      pauseReason: reason,
      remoteQueue: row.allow_remote_queue === 1,
      distanceM: here && row.lat != null && row.lng != null ? distanceM(here, { lat: row.lat, lng: row.lng }) : null,
    });
  }
  if (here) branchesOut.sort((x, y) => (x.distanceM ?? Infinity) - (y.distanceM ?? Infinity));

  let activeTicket = null;
  const bearer = await readGuestBearer(c.req.header('Authorization'), c.env.JWT_SECRET);
  if (bearer.kind === 'ok') {
    const t = await c.env.DB.prepare(
      `SELECT t.id, t.display_number, t.status, t.bucket_id, t.created_at, t.branch_id, b.name AS branch_name
       FROM tickets t JOIN branches b ON b.id = t.branch_id
       WHERE t.zalo_user_id = ?1 AND t.status IN ('WAITING', 'CALLED', 'HELD')
       ORDER BY t.created_at DESC LIMIT 1`,
    )
      .bind(bearer.claims.zid)
      .first<{ id: string; display_number: string; status: string; bucket_id: string; created_at: number; branch_id: string; branch_name: string }>();
    if (t) {
      const ahead = t.status === 'WAITING'
        ? (await c.env.DB.prepare(
            `SELECT COUNT(*) AS c FROM tickets WHERE bucket_id = ?1 AND status = 'WAITING' AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))`,
          ).bind(t.bucket_id, t.created_at, t.id).first<{ c: number }>())?.c ?? 0
        : 0;
      activeTicket = { id: t.id, displayNumber: t.display_number, status: t.status, branchId: t.branch_id, branchName: t.branch_name, partiesAhead: ahead };
    }
  }

  return c.json({ branches: branchesOut, activeTicket, located: here !== null });
});

/** GET /api/branches/by-qr/:qrToken — customer check-in */
branches.get('/by-qr/:qrToken', async (c) => {
  const qrToken = c.req.param('qrToken');
  const branch = await c.env.DB.prepare(
    `SELECT ${BRANCH_COLS}
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
      activeCounters: bucket.active_counters,
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
    isPaused:
      pauseReason(branch, Date.now(), Math.max(0, ...bucketPayload.map((b) => b.estimatedWaitMins))) !== null,
    pauseReason: pauseReason(branch, Date.now(), Math.max(0, ...bucketPayload.map((b) => b.estimatedWaitMins))),
    buckets: bucketPayload,
  });
});

/**
 * GET /api/branches/slug/:slug — TV kiosk fallback. Resolves the per-branch slug
 * (`pho-24-nh`) first; a merchant slug (`pho-24`) still works for old links and
 * picks the oldest branch.
 */
branches.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const branch =
    (await c.env.DB.prepare(
      `SELECT ${BRANCH_COLS} FROM branches b JOIN merchants m ON m.id = b.merchant_id
       WHERE b.slug = ?1`,
    )
      .bind(slug)
      .first<BranchJoinRow>()) ??
    (await c.env.DB.prepare(
      `SELECT ${BRANCH_COLS} FROM branches b JOIN merchants m ON m.id = b.merchant_id
       WHERE m.slug = ?1 ORDER BY b.created_at ASC LIMIT 1`,
    )
      .bind(slug)
      .first<BranchJoinRow>());

  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }
  return c.json(await buildTvPayload(c.env.DB, branch));
});

/** GET /api/branches/:branchId/tv — TV for one branch */
branches.get('/:branchId/tv', async (c) => {
  const branch = await loadBranchById(c.env.DB, c.req.param('branchId'));
  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }
  return c.json(await buildTvPayload(c.env.DB, branch));
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
  const today = vnDate();
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
    shortcutsEnabled: branch.shortcuts_enabled !== 0,
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

  await c.env.DB.prepare(
    `UPDATE branches SET is_paused = ?1,
       paused_at = CASE WHEN ?1 = 1 THEN COALESCE(paused_at, ?3) ELSE NULL END
     WHERE id = ?2`,
  )
    .bind(nextPaused, branchId, Date.now())
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
