import { Hono } from 'hono';
import { BranchQueueRoom } from './do/BranchQueueRoom';

export type Env = {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, service: 'luotdi-api' }));

/** Stub — atomic D1 issuance lands in GREEN (phase 1.2). */
app.post('/api/tickets', (c) =>
  c.json({ error: 'NOT_IMPLEMENTED', code: 'NOT_IMPLEMENTED' }, 501),
);

app.all('*', (c) => c.json({ error: 'NOT_IMPLEMENTED' }, 501));

export default {
  fetch: app.fetch,
};

export { BranchQueueRoom };
