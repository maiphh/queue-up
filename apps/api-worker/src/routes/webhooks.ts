/**
 * External payment webhooks (Phase 4.3).
 * RED stub — GREEN: Sepay VietQR top-up credits merchant wallet.
 */

import { Hono } from 'hono';
import type { Env } from '../index';

const webhooks = new Hono<{ Bindings: Env }>();

webhooks.post('/sepay', async (c) => {
  void c.env.DB;
  return c.json({ error: 'NOT_IMPLEMENTED', code: 'NOT_IMPLEMENTED' }, 501);
});

export { webhooks };
