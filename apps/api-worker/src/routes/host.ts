import { HostTicketActionRequestSchema } from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import { HostQueueService } from '../services/host-queue';

const ALLOWED_TEST_ROLES = new Set(['BRANCH_HOST', 'MERCHANT_OWNER']);

/**
 * Host queue mutations.
 * Production JWT lands later; test/miniflare honors `X-Test-Staff-Role`.
 */
const host = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

host.patch('/tickets/:id/action', async (c) => {
  const role = c.req.header('X-Test-Staff-Role');
  if (!role) {
    return c.json(apiError('Staff authentication required', 'UNAUTHORIZED'), 401);
  }
  if (!ALLOWED_TEST_ROLES.has(role)) {
    return c.json(apiError('Insufficient staff role', 'FORBIDDEN'), 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(apiError('Invalid JSON body', 'INVALID_BODY'), 400);
  }

  const parsed = HostTicketActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(apiError('Invalid request body', 'INVALID_BODY'), 400);
  }

  const ticketId = c.req.param('id');
  const service = new HostQueueService(c.env.DB, c.env.BRANCH_QUEUE_ROOM);
  const result = await service.applyAction(ticketId, parsed.data);

  if (!result.ok) {
    return c.json(apiError(result.error, result.code), result.status as 409);
  }

  return c.json(result.data, 200);
});

export { host };
