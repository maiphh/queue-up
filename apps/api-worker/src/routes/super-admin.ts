import { Hono } from 'hono';
import type { Env } from '../index';
import { resolveActor } from '../services';

const superAdmin = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

async function requirePlatformAdmin(c: {
  req: { raw: { headers: Headers } };
  env: Env;
}): Promise<
  | { ok: true }
  | { ok: false; status: 401 | 403; body: { error: string; code: string } }
> {
  const actorResult = await resolveActor(c.req.raw.headers, c.env);
  if (!actorResult.ok) {
    return {
      ok: false,
      status: 401,
      body: apiError('Staff authentication required', actorResult.code),
    };
  }
  if (actorResult.actor.role !== 'PLATFORM_ADMIN') {
    return {
      ok: false,
      status: 403,
      body: apiError('Insufficient staff role', 'FORBIDDEN'),
    };
  }
  return { ok: true };
}

/** GET /api/super-admin/branches */
superAdmin.get('/branches', async (c) => {
  const gate = await requirePlatformAdmin(c);
  if (!gate.ok) return c.json(gate.body, gate.status);

  const result = await c.env.DB.prepare(
    `SELECT b.id, b.name,
            m.id AS merchant_id, m.slug AS merchant_slug, m.name AS merchant_name,
            m.plan_tier,
            (SELECT COUNT(*) FROM tickets t
             WHERE t.branch_id = b.id AND t.status = 'WAITING') AS waiting_count
     FROM branches b
     JOIN merchants m ON m.id = b.merchant_id
     ORDER BY m.name ASC, b.name ASC`,
  ).all<{
    id: string;
    name: string;
    merchant_id: string;
    merchant_slug: string;
    merchant_name: string;
    plan_tier: string;
    waiting_count: number;
  }>();

  return c.json({
    branches: (result.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      merchantId: r.merchant_id,
      merchantSlug: r.merchant_slug,
      merchantName: r.merchant_name,
      planTier: r.plan_tier,
      waitingCount: r.waiting_count,
    })),
  });
});

/** POST /api/super-admin/branches/:id/impersonate — ack only (UI navigates) */
superAdmin.post('/branches/:id/impersonate', async (c) => {
  const gate = await requirePlatformAdmin(c);
  if (!gate.ok) return c.json(gate.body, gate.status);

  const id = c.req.param('id');
  const branch = await c.env.DB.prepare(`SELECT id FROM branches WHERE id = ?1`)
    .bind(id)
    .first<{ id: string }>();
  if (!branch) {
    return c.json({ error: 'Branch not found', code: 'BRANCH_NOT_FOUND' }, 404);
  }
  return c.json({ ok: true, branchId: id });
});

/** PATCH /api/super-admin/merchants/:id/plan */
superAdmin.patch('/merchants/:id/plan', async (c) => {
  const gate = await requirePlatformAdmin(c);
  if (!gate.ok) return c.json(gate.body, gate.status);

  const id = c.req.param('id');
  let planTier: string;
  try {
    const body = await c.req.json<{ planTier?: string }>();
    planTier = body.planTier === 'PRO' ? 'PRO' : 'FREE';
  } catch {
    return c.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, 400);
  }

  const result = await c.env.DB.prepare(
    `UPDATE merchants SET plan_tier = ?1 WHERE id = ?2`,
  )
    .bind(planTier, id)
    .run();

  if (!result.success || (result.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Merchant not found', code: 'MERCHANT_NOT_FOUND' }, 404);
  }

  return c.json({ ok: true, merchantId: id, planTier });
});

/** POST /api/super-admin/branches/:id/force-clear — cancel open tickets */
superAdmin.post('/branches/:id/force-clear', async (c) => {
  const gate = await requirePlatformAdmin(c);
  if (!gate.ok) return c.json(gate.body, gate.status);

  const id = c.req.param('id');
  const now = Date.now();
  const result = await c.env.DB.prepare(
    `UPDATE tickets
     SET status = 'CANCELLED', cancelled_at = ?1
     WHERE branch_id = ?2 AND status IN ('WAITING', 'CALLED', 'HELD')`,
  )
    .bind(now, id)
    .run();

  return c.json({
    ok: true,
    branchId: id,
    cancelledCount: result.meta?.changes ?? 0,
  });
});

export { superAdmin };
