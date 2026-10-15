import { Hono } from 'hono';
import type { Env } from '../index';
import type { Context } from 'hono';
import { buildVietQrMemo } from '@luotdi/shared';
import { assertBranchAccess, readActor } from '../services';
import { vnDate } from './manage';

const ZNS_PRICE_VND = 400;
/** Below this the wallet chip turns hot (≈ 25 messages). */
export const LOW_WALLET_VND = 10_000;
const VIETQR_ACCOUNT = { accountNumber: '0123456789', bankCode: 'VCB', bankName: 'Vietcombank' };

const client = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

/** GET /api/client/portfolio — CLIENT_ADMIN for X-Dev-Client-Id */
client.get('/portfolio', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }

  const actor = actorResult.actor;
  if (actor.role !== 'CLIENT_ADMIN') {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  const clientId = actor.clientId;
  if (!clientId) {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  const clientRow = await c.env.DB.prepare(
    `SELECT id, name FROM clients WHERE id = ?1`,
  )
    .bind(clientId)
    .first<{ id: string; name: string }>();

  if (!clientRow) {
    return c.json(apiError('Client not found', 'CLIENT_NOT_FOUND'), 404);
  }

  const brands = await c.env.DB.prepare(
    `SELECT id, name, slug, industry_type, plan_tier, wallet_balance_vnd
     FROM merchants
     WHERE client_id = ?1
     ORDER BY name ASC`,
  )
    .bind(clientId)
    .all<{ id: string; name: string; slug: string; industry_type: string; plan_tier: string; wallet_balance_vnd: number }>();

  const today = vnDate(Date.now());
  const brandsOut = [];
  const totals = { waiting: 0, servedToday: 0, waitSum: 0, waitN: 0, open: 0, branches: 0, paused: 0 };
  for (const brand of brands.results ?? []) {
    const branchRows = await c.env.DB.prepare(
      `SELECT b.id, b.name, b.address, b.district, b.is_paused, b.slug,
              (SELECT COUNT(*) FROM tickets t WHERE t.branch_id = b.id AND t.status = 'WAITING') AS waiting_count,
              (SELECT COUNT(*) FROM tickets t WHERE t.branch_id = b.id AND t.ticket_date = ?2 AND t.status = 'SEATED') AS served_today,
              (SELECT AVG((t.called_at - t.created_at) / 60000.0) FROM tickets t
                WHERE t.branch_id = b.id AND t.ticket_date = ?2 AND t.called_at IS NOT NULL) AS avg_wait
       FROM branches b
       WHERE b.merchant_id = ?1
       ORDER BY b.name ASC`,
    )
      .bind(brand.id, today)
      .all<{
        id: string; name: string; address: string; district: string; is_paused: number; slug: string | null;
        waiting_count: number; served_today: number; avg_wait: number | null;
      }>();

    const rows = branchRows.results ?? [];
    for (const b of rows) {
      totals.branches += 1;
      totals.waiting += b.waiting_count;
      totals.servedToday += b.served_today;
      if (b.avg_wait != null) { totals.waitSum += b.avg_wait; totals.waitN += 1; }
      if (b.is_paused === 1) totals.paused += 1;
      else totals.open += 1;
    }
    brandsOut.push({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      industryType: brand.industry_type,
      planTier: brand.plan_tier,
      walletBalanceVnd: brand.wallet_balance_vnd,
      walletMessages: Math.floor(brand.wallet_balance_vnd / ZNS_PRICE_VND),
      walletLow: brand.wallet_balance_vnd < LOW_WALLET_VND,
      branches: rows.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        district: b.district,
        tvSlug: b.slug ?? brand.slug,
        waitingCount: b.waiting_count,
        servedToday: b.served_today,
        avgWaitMins: b.avg_wait == null ? null : Math.round(b.avg_wait),
        isPaused: b.is_paused === 1,
        queueStatus: b.is_paused === 1 ? 'PAUSED' : 'OPEN',
      })),
    });
  }

  return c.json({
    clientId: clientRow.id,
    clientName: clientRow.name,
    kpis: {
      waiting: totals.waiting,
      servedToday: totals.servedToday,
      avgWaitMins: totals.waitN ? Math.round(totals.waitSum / totals.waitN) : null,
      openBranches: totals.open,
      totalBranches: totals.branches,
      pausedBranches: totals.paused,
    },
    brands: brandsOut,
  });
});

// ───────────── Branch setup (M3): buckets + brand wallet ─────────────

async function gateBranch(c: Context<{ Bindings: Env }>) {
  const r = readActor(c.req.raw.headers);
  if (!r.ok) return c.json(apiError('Staff authentication required', r.code), 401);
  // Buckets + wallet belong to the brand owner: Client (or Platform Admin), not the branch manager.
  if (r.actor.role === 'BRANCH_MANAGER') return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  const branchId = c.req.param('branchId')!;
  const exists = await c.env.DB.prepare(`SELECT 1 AS ok FROM branches WHERE id = ?1`).bind(branchId).first();
  if (!exists) return c.json(apiError('Branch not found', 'BRANCH_NOT_FOUND'), 404);
  const access = await assertBranchAccess(c.env.DB, r.actor, branchId);
  if (access !== true) return c.json(apiError('Insufficient staff role', access.code), access.status);
  return null;
}

type SetupBranch = {
  id: string; name: string; address: string; district: string; routing_mode: string; slug: string | null;
  merchant_id: string; merchant_name: string; merchant_slug: string; industry_type: string; plan_tier: string; wallet_balance_vnd: number;
};

async function loadSetup(db: D1Database, branchId: string) {
  const b = (await db
    .prepare(
      `SELECT b.id, b.name, b.address, b.district, b.routing_mode, b.slug,
              m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug, m.industry_type, m.plan_tier, m.wallet_balance_vnd
       FROM branches b JOIN merchants m ON m.id = b.merchant_id WHERE b.id = ?1`,
    )
    .bind(branchId)
    .first<SetupBranch>())!;
  const [buckets, ledger, spend] = await Promise.all([
    db.prepare(
      `SELECT id, prefix, label_vi, min_pax, max_pax, active_counters, is_active, current_seq
       FROM queue_buckets WHERE branch_id = ?1 ORDER BY prefix ASC`,
    ).bind(branchId).all<{ id: string; prefix: string; label_vi: string; min_pax: number; max_pax: number; active_counters: number; is_active: number; current_seq: number }>(),
    db.prepare(
      `SELECT l.id, l.amount_vnd, l.tx_type, l.reference_code, l.created_at, t.display_number
       FROM wallet_ledger l LEFT JOIN tickets t ON t.id = l.ticket_id
       WHERE l.merchant_id = ?1 ORDER BY l.created_at DESC LIMIT 20`,
    ).bind(b.merchant_id).all<{ id: string; amount_vnd: number; tx_type: string; reference_code: string | null; created_at: number; display_number: string | null }>(),
    db.prepare(
      `SELECT COALESCE(SUM(-amount_vnd), 0) AS spent FROM wallet_ledger
       WHERE merchant_id = ?1 AND amount_vnd < 0 AND created_at >= ?2`,
    ).bind(b.merchant_id, Date.now() - 7 * 86_400_000).first<{ spent: number }>(),
  ]);
  const perDay = (spend?.spent ?? 0) / 7;
  return {
    branchId: b.id,
    branchName: b.name,
    address: b.address,
    district: b.district,
    routingMode: b.routing_mode,
    tvSlug: b.slug ?? b.merchant_slug,
    merchantId: b.merchant_id,
    merchantName: b.merchant_name,
    merchantSlug: b.merchant_slug,
    industryType: b.industry_type,
    planTier: b.plan_tier,
    buckets: (buckets.results ?? []).map((q) => ({
      id: q.id, prefix: q.prefix, labelVi: q.label_vi, minPax: q.min_pax, maxPax: q.max_pax,
      activeCounters: q.active_counters, isActive: q.is_active === 1, issued: q.current_seq,
    })),
    wallet: {
      balanceVnd: b.wallet_balance_vnd,
      messages: Math.floor(b.wallet_balance_vnd / ZNS_PRICE_VND),
      daysLeft: perDay > 0 ? Math.floor(b.wallet_balance_vnd / perDay) : null,
      low: b.wallet_balance_vnd < LOW_WALLET_VND,
      sharedAcrossBrand: true,
    },
    ledger: (ledger.results ?? []).map((l) => ({
      id: l.id, amountVnd: l.amount_vnd, txType: l.tx_type, createdAt: l.created_at,
      displayNumber: l.display_number, reference: l.reference_code,
    })),
    vietQr: { ...VIETQR_ACCOUNT, accountName: b.merchant_name.toUpperCase() },
    vietQrMemo: buildVietQrMemo(b.merchant_slug),
  };
}

client.get('/branches/:branchId', async (c) => {
  const denied = await gateBranch(c);
  if (denied) return denied;
  return c.json(await loadSetup(c.env.DB, c.req.param('branchId')));
});

export type BucketInput = { id?: string; prefix: string; labelVi?: string; minPax: number; maxPax: number; activeCounters: number; isActive: boolean };

/**
 * Validate a full bucket set. PARTY_SIZE: active buckets must cover 1..max with no overlap/gap.
 * Returns per-prefix field errors + a coverage message, or null when valid.
 */
export function validateBuckets(mode: string, list: BucketInput[]): { fields: Record<string, string>; coverage: string | null } | null {
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  for (const b of list) {
    if (!/^[A-Z]$/.test(b.prefix ?? '')) { fields[b.prefix || '?'] = 'Mã bàn là 1 chữ cái A–Z'; continue; }
    if (seen.has(b.prefix)) fields[b.prefix] = 'Trùng mã bàn';
    seen.add(b.prefix);
    if (!Number.isInteger(b.activeCounters) || b.activeCounters < 1 || b.activeCounters > 20) fields[b.prefix] = 'Số quầy từ 1 đến 20';
    if (mode === 'SERVICE_TYPE') {
      if (!b.labelVi?.trim()) fields[b.prefix] = 'Nhập tên dịch vụ';
    } else if (!Number.isInteger(b.minPax) || !Number.isInteger(b.maxPax) || b.minPax < 1 || b.maxPax > 50 || b.minPax > b.maxPax) {
      fields[b.prefix] = 'Khoảng khách không hợp lệ';
    }
  }
  const active = list.filter((b) => b.isActive);
  let coverage: string | null = active.length === 0 ? 'Cần ít nhất 1 bàn đang bật' : null;
  if (!coverage && mode !== 'SERVICE_TYPE' && Object.keys(fields).length === 0) {
    const sorted = [...active].sort((a, b) => a.minPax - b.minPax);
    let next = 1;
    for (const b of sorted) {
      if (b.minPax > next) { coverage = `Khách ${next}${b.minPax - 1 > next ? `–${b.minPax - 1}` : ''} người chưa có bàn`; fields[b.prefix] = 'Hở khoảng khách'; break; }
      if (b.minPax < next) { coverage = `Bàn ${b.prefix} trùng khoảng khách với bàn trước`; fields[b.prefix] = 'Trùng khoảng khách'; break; }
      next = b.maxPax + 1;
    }
  }
  return Object.keys(fields).length || coverage ? { fields, coverage } : null;
}

/** PUT /api/client/branches/:id/buckets — replace the bucket set (buckets are deactivated, never deleted). */
client.put('/branches/:branchId/buckets', async (c) => {
  const denied = await gateBranch(c);
  if (denied) return denied;
  const branchId = c.req.param('branchId');
  let body: { routingMode?: string; buckets?: BucketInput[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON', 'INVALID_BODY'), 400);
  }
  const mode = body.routingMode === 'SERVICE_TYPE' ? 'SERVICE_TYPE' : body.routingMode === 'PARTY_SIZE' ? 'PARTY_SIZE' : null;
  if (!mode || !Array.isArray(body.buckets)) return c.json(apiError('Invalid body', 'INVALID_BODY'), 400);
  const bad = validateBuckets(mode, body.buckets);
  if (bad) return c.json({ ...apiError('Invalid buckets', 'INVALID_BUCKETS'), ...bad }, 400);

  const existing = await c.env.DB.prepare(`SELECT id, prefix FROM queue_buckets WHERE branch_id = ?1`).bind(branchId).all<{ id: string; prefix: string }>();
  const byPrefix = new Map((existing.results ?? []).map((r) => [r.prefix, r.id]));
  const keep = new Set(body.buckets.map((b) => b.prefix));
  const stmts = [c.env.DB.prepare(`UPDATE branches SET routing_mode = ?1 WHERE id = ?2`).bind(mode, branchId)];
  for (const b of body.buckets) {
    const labelVi = b.labelVi?.trim() || (b.minPax === b.maxPax ? `${b.minPax} khách` : `${b.minPax}–${b.maxPax} khách`);
    const id = byPrefix.get(b.prefix) ?? crypto.randomUUID();
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO queue_buckets (id, branch_id, prefix, label_vi, label_en, min_pax, max_pax, active_counters, rolling_turnover_mins, current_seq, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 20, 0, ?9)
         ON CONFLICT(branch_id, prefix) DO UPDATE SET label_vi = excluded.label_vi, min_pax = excluded.min_pax,
           max_pax = excluded.max_pax, active_counters = excluded.active_counters, is_active = excluded.is_active`,
      ).bind(id, branchId, b.prefix, labelVi, labelVi, b.minPax, b.maxPax, b.activeCounters, b.isActive ? 1 : 0),
    );
  }
  for (const [prefix, id] of byPrefix) {
    if (!keep.has(prefix)) stmts.push(c.env.DB.prepare(`UPDATE queue_buckets SET is_active = 0 WHERE id = ?1`).bind(id));
  }
  await c.env.DB.batch(stmts);
  return c.json(await loadSetup(c.env.DB, branchId));
});

/** POST /api/client/branches/:id/topup — VietQR transfer details; the SePay webhook credits the wallet. */
client.post('/branches/:branchId/topup', async (c) => {
  const denied = await gateBranch(c);
  if (denied) return denied;
  let body: { amountVnd?: number };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const amount = body.amountVnd;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 10_000 || amount > 50_000_000) {
    return c.json(apiError('Số tiền từ 10.000đ đến 50.000.000đ', 'INVALID_AMOUNT'), 400);
  }
  const s = await loadSetup(c.env.DB, c.req.param('branchId'));
  const qrUrl =
    `https://img.vietqr.io/image/${s.vietQr.bankCode}-${s.vietQr.accountNumber}-compact.png` +
    `?amount=${amount}&addInfo=${encodeURIComponent(s.vietQrMemo)}&accountName=${encodeURIComponent(s.vietQr.accountName)}`;
  return c.json({
    amountVnd: amount,
    memo: s.vietQrMemo,
    bank: s.vietQr,
    // Payload for an on-screen QR (no third-party image needed).
    qrPayload: `${s.vietQr.bankCode}|${s.vietQr.accountNumber}|${amount}|${s.vietQrMemo}`,
    qrImageUrl: qrUrl,
    balanceVnd: s.wallet.balanceVnd,
  });
});

export { client };
