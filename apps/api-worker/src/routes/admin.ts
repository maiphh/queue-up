import {
  OnboardClientRequestSchema,
  buildVietQrMemo,
} from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import { assertBranchAccess, readActor } from '../services';

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

  const clientRows = await c.env.DB.prepare(
    `SELECT id, name FROM clients ORDER BY name ASC`,
  ).all<{ id: string; name: string }>();

  const clientsOut = [];
  for (const client of clientRows.results ?? []) {
    const brands = await c.env.DB.prepare(
      `SELECT id, name, slug, industry_type, plan_tier, wallet_balance_vnd
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
      }>();

    const brandsOut = [];
    for (const brand of brands.results ?? []) {
      const branchRows = await c.env.DB.prepare(
        `SELECT b.id, b.name, b.district, b.is_paused,
                (SELECT COUNT(*) FROM tickets t
                 WHERE t.branch_id = b.id AND t.status = 'WAITING') AS waiting_count
         FROM branches b
         WHERE b.merchant_id = ?1
         ORDER BY b.name ASC`,
      )
        .bind(brand.id)
        .all<{
          id: string;
          name: string;
          district: string;
          is_paused: number;
          waiting_count: number;
        }>();

      brandsOut.push({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        industryType: brand.industry_type,
        planTier: brand.plan_tier,
        walletBalanceVnd: brand.wallet_balance_vnd,
        branches: (branchRows.results ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          district: b.district,
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

  return c.json({ clients: clientsOut });
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
  const now = Date.now();
  const clientId = crypto.randomUUID();
  const merchantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const bucketId = crypto.randomUUID();

  const slug = await uniqueSlug(c.env.DB, slugifyBrand(data.brandName));
  const qrToken = await uniqueQrToken(c.env.DB, qrTokenFromSlug(slug));

  const isParty = data.routingMode === 'PARTY_SIZE';
  const labelVi = isParty ? '01-02' : data.branchName;
  const labelEn = isParty ? '01-02' : data.branchName;
  const minPax = 1;
  const maxPax = isParty ? 2 : 1;

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
         grace_period_mins, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, 'Ho Chi Minh', ?6, ?7, 1, 0, 10, ?8)`,
    ).bind(
      branchId,
      merchantId,
      data.branchName,
      data.address,
      data.district,
      qrToken,
      data.routingMode,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO queue_buckets (
         id, branch_id, prefix, label_vi, label_en,
         min_pax, max_pax, active_counters, rolling_turnover_mins,
         current_seq, is_active
       ) VALUES (?1, ?2, 'A', ?3, ?4, ?5, ?6, 1, 20, 0, 1)`,
    ).bind(bucketId, branchId, labelVi, labelEn, minPax, maxPax),
  ]);

  return c.json({ clientId, merchantId, branchId, bucketId }, 201);
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
