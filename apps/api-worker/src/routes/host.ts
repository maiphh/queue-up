import { HostTicketActionRequestSchema } from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';
import {
  assertBranchAccess,
  HostQueueService,
  readActor,
  znsSenderFromEnv,
} from '../services';

/**
 * Host queue mutations.
 * Production JWT lands later; test/miniflare honors actor headers.
 */
const host = new Hono<{ Bindings: Env }>();

function apiError(error: string, code: string) {
  return { error, code };
}

host.patch('/tickets/:id/action', async (c) => {
  const actorResult = readActor(c.req.raw.headers);
  if (!actorResult.ok) {
    return c.json(apiError('Staff authentication required', actorResult.code), 401);
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
  const ticket = await c.env.DB.prepare(
    `SELECT id, branch_id FROM tickets WHERE id = ?1`,
  )
    .bind(ticketId)
    .first<{ id: string; branch_id: string }>();

  if (!ticket) {
    return c.json(apiError('Ticket not found', 'TICKET_NOT_FOUND'), 404);
  }

  const access = await assertBranchAccess(
    c.env.DB,
    actorResult.actor,
    ticket.branch_id,
  );
  if (access !== true) {
    return c.json(apiError('Insufficient staff role', access.code), access.status);
  }

  const service = new HostQueueService(
    c.env.DB,
    c.env.BRANCH_QUEUE_ROOM,
    znsSenderFromEnv(c.env),
  );
  const result = await service.applyAction(ticketId, parsed.data);

  if (!result.ok) {
    return c.json(apiError(result.error, result.code), result.status as 409);
  }

  return c.json(result.data, 200);
});

export { host };
