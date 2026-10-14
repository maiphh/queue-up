import { Hono } from 'hono';
import type { Env } from '../index';

/**
 * Host queue mutations — RED stub.
 * GREEN: HostQueueService + JWT (BRANCH_HOST | MERCHANT_OWNER).
 * Test env may honor `X-Test-Staff-Role` bypass header.
 */
const host = new Hono<{ Bindings: Env }>();

host.patch('/tickets/:id/action', (c) => {
  return c.json(
    { error: 'Host ticket actions not implemented', code: 'NOT_IMPLEMENTED' },
    501,
  );
});

export { host };
