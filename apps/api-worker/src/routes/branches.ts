import { Hono } from 'hono';
import type { Env } from '../index';

/**
 * Branch-scoped routes.
 * `GET /:branchId/ws` upgrades and forwards to BranchQueueRoom DO.
 */
const branches = new Hono<{ Bindings: Env }>();

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
