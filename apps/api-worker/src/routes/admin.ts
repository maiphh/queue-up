import {
  OnboardClientRequestSchema,
  buildVietQrMemo,
} from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import { assertBranchAccess, readActor } from '../services';
import { LOW_WALLET_VND } from './client';
import { vnDate } from './manage';

/** FREE plan monthly ticket cap (see POST /api/tickets FREE_QUOTA_EXCEEDED). */
export const FREE_MONTHLY_QUOTA = 200;
/** "Cần chú ý" flags a pause this long. */
const LONG_PAUSE_MINS = 30;
const TV_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const admin = new Hono<{ Bindings: Env }>();

type BranchJoinRow = {
  id: string;
  name: string;
  qr_code_token: string;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  plan_tier: string;
  wallet_balance_vnd: number;
};

function apiError(error: string, code: string) {
  return { error, code };
}

function slugifyBrand(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'brand';
}

function qrTokenFromSlug(slug: string): string {
  return `qr-${slug}`.slice(0, 64);
}

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = await db
      .prepare(`SELECT id FROM merchants WHERE slug = ?1`)
      .bind(candidate)
      .first();
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

async function uniqueQrToken(db: D1Database, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    const existing = await db
      .prepare(`SELECT id FROM branches WHERE qr_code_token = ?1`)
      .bind(candidate)
      .first();
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

/** GET /api/admin/overview — PLATFORM_ADMIN only */
admin.get('/overview', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }
  if (actorResult.actor.role !== 'PLATFORM_ADMIN') {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  const now = Date.now();
  const today = vnDate(now);
  const clientRows = await c.env.DB.prepare(
    `SELECT id, name FROM clients ORDER BY name ASC`,
  ).all<{ id: string; name: string }>();

  const kpis = { waitingTotal: 0, ticketsToday: 0, pausedBranches: 0, lowWalletBrands: 0, freeNearQuota: 0, branches: 0, brands: 0 };
  const attention: { kind: 'LOW_WALLET' | 'LONG_PAUSE' | 'SILENT'; brandId: string; branchId?: string; title: string; detail: string }[] = [];
  let lowWalletFirst: { name: string; balanceVnd: number } | null = null;
  const clientsOut = [];
  for (const client of clientRows.results ?? []) {
    const brands = await c.env.DB.prepare(
      `SELECT id, name, slug, industry_type, plan_tier, wallet_balance_vnd, monthly_ticket_count
       FROM merchants
       WHERE client_id = ?1
       ORDER BY name ASC`,
    )
      .bind(client.id)
      .all<{
        id: string;
        name: string;
        slug: string;
        industry_type: string;
        plan_tier: string;
        wallet_balance_vnd: number;
        monthly_ticket_count: number;
      }>();

    const brandsOut = [];
    for (const brand of brands.results ?? []) {
      kpis.brands += 1;
      const walletLow = brand.wallet_balance_vnd < LOW_WALLET_VND;
      if (walletLow) {
        kpis.lowWalletBrands += 1;
        lowWalletFirst ??= { name: brand.name, balanceVnd: brand.wallet_balance_vnd };
        attention.push({
          kind: 'LOW_WALLET', brandId: brand.id,
          title: `${brand.name} còn ${brand.wallet_balance_vnd.toLocaleString('vi-VN')}đ ≈ ${Math.floor(brand.wallet_balance_vnd / 400)} tin Zalo`,
          detail: 'Hết ví, khách chỉ nhận báo trong Mini App, không nhận tin Zalo',
        });
      }
      if (brand.plan_tier === 'FREE' && brand.monthly_ticket_count >= FREE_MONTHLY_QUOTA * 0.8) kpis.freeNearQuota += 1;
      const branchRows = await c.env.DB.prepare(
        `SELECT b.id, b.name, b.district, b.is_paused, b.paused_at, b.slug,
                (SELECT COUNT(*) FROM tickets t
                 WHERE t.branch_id = b.id AND t.status = 'WAITING') AS waiting_count,
                (SELECT COUNT(*) FROM tickets t
                 WHERE t.branch_id = b.id AND t.ticket_date = ?2) AS today_count
         FROM branches b
         WHERE b.merchant_id = ?1
         ORDER BY b.name ASC`,
      )
        .bind(brand.id, today)
        .all<{
          id: string;
          name: string;
          district: string;
          is_paused: number;
          paused_at: number | null;
          slug: string | null;
          waiting_count: number;
          today_count: number;
        }>();

      const rows = branchRows.results ?? [];
      for (const b of rows) {
        kpis.branches += 1;
        kpis.waitingTotal += b.waiting_count;
        kpis.ticketsToday += b.today_count;
        if (b.is_paused === 1) {
          kpis.pausedBranches += 1;
          const mins = b.paused_at ? Math.floor((now - b.paused_at) / 60_000) : null;
          if (mins == null || mins >= LONG_PAUSE_MINS) {
            attention.push({
              kind: 'LONG_PAUSE', brandId: brand.id, branchId: b.id,
              title: mins == null ? `${b.name} đang tạm dừng` : `${b.name} tạm dừng ${mins} phút`,
              detail: b.waiting_count ? `${b.waiting_count} nhóm vẫn đang giữ lượt` : 'Không còn ai trong hàng chờ',
            });
          }
        } else if (b.today_count === 0) {
          attention.push({
            kind: 'SILENT', brandId: brand.id, branchId: b.id,
            title: `${b.name} chưa có lượt nào hôm nay`,
            detail: 'Kiểm tra mã QR đã in và TV đã kết nối',
          });
        }
      }

      brandsOut.push({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        industryType: brand.industry_type,
        planTier: brand.plan_tier,
        walletBalanceVnd: brand.wallet_balance_vnd,
        walletLow,
        monthlyTicketCount: brand.monthly_ticket_count,
        monthlyQuota: brand.plan_tier === 'FREE' ? FREE_MONTHLY_QUOTA : null,
        branches: rows.map((b) => ({
          id: b.id,
          name: b.name,
          district: b.district,
          slug: b.slug ?? brand.slug,
          waitingCount: b.waiting_count,
          isPaused: b.is_paused === 1,
        })),
      });
    }

    clientsOut.push({
      id: client.id,
      name: client.name,
      brands: brandsOut,
    });
  }

  return c.json({ kpis: { ...kpis, lowWalletFirst, freeQuota: FREE_MONTHLY_QUOTA }, attention, clients: clientsOut });
});

/** POST /api/admin/clients — PLATFORM_ADMIN onboard */
admin.post('/clients', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }
  if (actorResult.actor.role !== 'PLATFORM_ADMIN') {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON', 'INVALID_BODY'), 400);
  }

  const parsed = OnboardClientRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(apiError('Invalid request body', 'INVALID_BODY'), 400);
  }

  const data = parsed.data;
  const extra = (body ?? {}) as { tvSlug?: unknown; graceMins?: unknown };
  const fields: Record<string, string> = {};
  let branchSlug: string | null = null;
  if (extra.tvSlug !== undefined && extra.tvSlug !== null && extra.tvSlug !== '') {
    if (typeof extra.tvSlug !== 'string' || !TV_SLUG_RE.test(extra.tvSlug)) fields.tvSlug = 'Chỉ chữ thường, số và dấu gạch (3–40 ký tự)';
    else branchSlug = extra.tvSlug;
  }
  let graceMins = 10;
  if (extra.graceMins !== undefined) {
    if (typeof extra.graceMins !== 'number' || !Number.isInteger(extra.graceMins) || extra.graceMins < 3 || extra.graceMins > 30) fields.graceMins = 'Từ 3 đến 30 phút';
    else graceMins = extra.graceMins;
  }
  if (Object.keys(fields).length) return c.json({ ...apiError('Invalid request body', 'INVALID_BODY'), fields }, 400);
  if (branchSlug) {
    const taken = await c.env.DB.prepare(`SELECT 1 AS x FROM branches WHERE slug = ?1`).bind(branchSlug).first();
    if (taken) return c.json({ ...apiError('TV slug already used', 'SLUG_TAKEN'), fields: { tvSlug: 'Đường dẫn này đã có quán dùng' } }, 409);
  }
  const now = Date.now();
  const clientId = crypto.randomUUID();
  const merchantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const bucketId = crypto.randomUUID();

  const slug = await uniqueSlug(c.env.DB, slugifyBrand(data.brandName));
  const qrToken = await uniqueQrToken(c.env.DB, qrTokenFromSlug(slug));

  const isParty = data.routingMode === 'PARTY_SIZE';
  // Party-size default covers every group (A 1–2 · B 3–4 · C 5–12); service mode starts with one service.
  const bucketSeeds: [string, string, number, number][] = isParty
    ? [['A', '1–2 khách', 1, 2], ['B', '3–4 khách', 3, 4], ['C', '5–12 khách', 5, 12]]
    : [['A', data.branchName, 1, 1]];
  if (!branchSlug) {
    let candidate = `${slug}-${slugifyBrand(data.branchName).slice(0, 12)}`.replace(/-+$/, '').slice(0, 40);
    let n = 2;
    while (await c.env.DB.prepare(`SELECT 1 AS x FROM branches WHERE slug = ?1`).bind(candidate).first()) {
      candidate = `${candidate.replace(/-\d+$/, '')}-${n}`;
      n += 1;
    }
    branchSlug = candidate;
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO clients (id, name, created_at) VALUES (?1, ?2, ?3)`,
    ).bind(clientId, data.clientName, now),
    c.env.DB.prepare(
      `INSERT INTO merchants (
         id, client_id, name, slug, industry_type, plan_tier,
         monthly_ticket_count, wallet_balance_vnd, status, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 'ACTIVE', ?7)`,
    ).bind(
      merchantId,
      clientId,
      data.brandName,
      slug,
      data.industryType,
      data.planTier,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO branches (
         id, merchant_id, name, address, district, city,
         qr_code_token, routing_mode, allow_remote_queue, is_paused,
         grace_period_mins, created_at, slug
       ) VALUES (?1, ?2, ?3, ?4, ?5, 'Ho Chi Minh', ?6, ?7, 1, 0, ?8, ?9, ?10)`,
    ).bind(
      branchId,
      merchantId,
      data.branchName,
      data.address,
      data.district,
      qrToken,
      data.routingMode,
      graceMins,
      now,
      branchSlug,
    ),
    ...bucketSeeds.map(([prefix, label, min, max], i) =>
      c.env.DB.prepare(
        `INSERT INTO queue_buckets (
           id, branch_id, prefix, label_vi, label_en,
           min_pax, max_pax, active_counters, rolling_turnover_mins,
           current_seq, is_active
         ) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, 1, 20, 0, 1)`,
      ).bind(i === 0 ? bucketId : crypto.randomUUID(), branchId, prefix, label, min, max),
    ),
  ]);

  return c.json({
    clientId, merchantId, branchId, bucketId,
    merchantSlug: slug,
    tvSlug: branchSlug,
    walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(qrToken)}`,
  }, 201);
});

/** GET /api/admin/config?branchId= */
admin.get('/config', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }
  if (actorResult.actor.role === 'BRANCH_MANAGER') {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  const branchIdParam = c.req.query('branchId');

  const branch = branchIdParam
    ? await c.env.DB.prepare(
        `SELECT b.id, b.name, b.qr_code_token,
                m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
                m.plan_tier, m.wallet_balance_vnd
         FROM branches b
         JOIN merchants m ON m.id = b.merchant_id
         WHERE b.id = ?1`,
      )
        .bind(branchIdParam)
        .first<BranchJoinRow>()
    : await c.env.DB.prepare(
        `SELECT b.id, b.name, b.qr_code_token,
                m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
                m.plan_tier, m.wallet_balance_vnd
         FROM branches b
         JOIN merchants m ON m.id = b.merchant_id
         ORDER BY b.created_at ASC
         LIMIT 1`,
      ).first<BranchJoinRow>();

  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }

  const access = await assertBranchAccess(
    c.env.DB,
    actorResult.actor,
    branch.id,
  );
  if (access !== true) {
    return c.json(apiError('Insufficient staff role', access.code), access.status);
  }

  const bucketResult = await c.env.DB.prepare(
    `SELECT id, prefix, label_vi, label_en, min_pax, max_pax,
            active_counters, is_active
     FROM queue_buckets
     WHERE branch_id = ?1
     ORDER BY prefix ASC`,
  )
    .bind(branch.id)
    .all<{
      id: string;
      prefix: string;
      label_vi: string;
      label_en: string;
      min_pax: number;
      max_pax: number;
      active_counters: number;
      is_active: number;
    }>();

  return c.json({
    merchantId: branch.merchant_id,
    merchantSlug: branch.merchant_slug,
    merchantName: branch.merchant_name,
    branchId: branch.id,
    branchName: branch.name,
    walletBalanceVnd: branch.wallet_balance_vnd,
    planTier: branch.plan_tier,
    buckets: (bucketResult.results ?? []).map((b) => ({
      id: b.id,
      prefix: b.prefix,
      labelVi: b.label_vi,
      labelEn: b.label_en,
      minPax: b.min_pax,
      maxPax: b.max_pax,
      activeCounters: b.active_counters,
      isActive: b.is_active === 1,
    })),
    walkInQrUrl: `https://zalo.me/app/link?qr=${encodeURIComponent(branch.qr_code_token)}`,
    vietQr: {
      accountNumber: '0123456789',
      bankCode: 'VCB',
      accountName: branch.merchant_name.toUpperCase(),
    },
    vietQrMemo: buildVietQrMemo(branch.merchant_slug),
  });
});

/** POST /api/admin/buckets — upsert bucket (dev-friendly) */
admin.post('/buckets', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
  }
  if (actorResult.actor.role === 'BRANCH_MANAGER') {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  let body: {
    id?: string;
    branchId: string;
    prefix: string;
    labelVi?: string;
    labelEn?: string;
    minPax: number;
    maxPax: number;
    activeCounters: number;
    isActive?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, 400);
  }

  if (!body.branchId) {
    return c.json({ error: 'branchId required', code: 'INVALID_BODY' }, 400);
  }

  const access = await assertBranchAccess(
    c.env.DB,
    actorResult.actor,
    body.branchId,
  );
  if (access !== true) {
    return c.json(apiError('Insufficient staff role', access.code), access.status);
  }

  const id = body.id ?? crypto.randomUUID();
  const labelVi = body.labelVi ?? `${body.prefix} KHÁCH`;
  const labelEn = body.labelEn ?? `${body.prefix} GUESTS`;
  const isActive = body.isActive === false ? 0 : 1;

  await c.env.DB.prepare(
    `INSERT INTO queue_buckets (
       id, branch_id, prefix, label_vi, label_en,
       min_pax, max_pax, active_counters, rolling_turnover_mins,
       current_seq, is_active
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 20, 0, ?9)
     ON CONFLICT(branch_id, prefix) DO UPDATE SET
       label_vi = excluded.label_vi,
       label_en = excluded.label_en,
       min_pax = excluded.min_pax,
       max_pax = excluded.max_pax,
       active_counters = excluded.active_counters,
       is_active = excluded.is_active`,
  )
    .bind(
      id,
      body.branchId,
      body.prefix,
      labelVi,
      labelEn,
      body.minPax,
      body.maxPax,
      body.activeCounters,
      isActive,
    )
    .run();

  return c.json({ ok: true, id });
});

export { admin };
