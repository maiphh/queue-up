import { buildVietQrMemo } from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';

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

/** GET /api/admin/config?branchId= */
admin.get('/config', async (c) => {
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
