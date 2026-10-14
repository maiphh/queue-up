import { Hono } from 'hono';
import { BranchQueueRoom } from './do/BranchQueueRoom';
import { branches, host, tickets } from './routes';
import { dailyResetCron, sweepExpiredHolds } from './services';

export type Env = {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, service: 'luotdi-api' }));

app.route('/api/tickets', tickets);
app.route('/api/host', host);
app.route('/api/branches', branches);

app.all('*', (c) => c.json({ error: 'NOT_IMPLEMENTED' }, 501));

/**
 * Cloudflare Cron Trigger — `0 21 * * *` (04:00 AM Vietnam UTC+7).
 * RED: wired to service stubs. GREEN: real sweep + daily reset.
 */
async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const nowMs = Date.now();
  await sweepExpiredHolds(env.DB, nowMs);
  await dailyResetCron(env.DB, nowMs);
}

export default {
  fetch: app.fetch,
  scheduled,
};

export { BranchQueueRoom };
