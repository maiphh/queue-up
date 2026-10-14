import { Hono } from 'hono';
import { BranchQueueRoom } from './do/BranchQueueRoom';
import { tickets } from './routes';

export type Env = {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, service: 'luotdi-api' }));

app.route('/api/tickets', tickets);

app.all('*', (c) => c.json({ error: 'NOT_IMPLEMENTED' }, 501));

export default {
  fetch: app.fetch,
};

export { BranchQueueRoom };
