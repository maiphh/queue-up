import { Hono } from 'hono';
import type { Env } from '../index';
import { readActor } from '../services';

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
    `SELECT id, name, slug, industry_type
     FROM merchants
     WHERE client_id = ?1
     ORDER BY name ASC`,
  )
    .bind(clientId)
    .all<{
      id: string;
      name: string;
      slug: string;
      industry_type: string;
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
      branches: (branchRows.results ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        district: b.district,
        waitingCount: b.waiting_count,
        isPaused: b.is_paused === 1,
        queueStatus: b.is_paused === 1 ? 'PAUSED' : 'OPEN',
      })),
    });
  }

  return c.json({
    clientId: clientRow.id,
    clientName: clientRow.name,
    brands: brandsOut,
  });
});

export { client };
