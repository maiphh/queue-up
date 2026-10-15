import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BranchQueueRoom } from './do/BranchQueueRoom';
import {
  admin,
  auth,
  branches,
  client,
  host,
  manage,
  superAdmin,
  tickets,
  webhooks,
} from './routes';
import { dailyResetCron, sweepExpiredHolds } from './services';

export type Env = {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
  /** 'dev' enables /api/auth/dev. Set in wrangler.toml [vars]. */
  ENVIRONMENT?: string;
  /** Extra comma-separated CORS origins (e.g. local zmp preview). */
  CORS_EXTRA_ORIGINS?: string;
  // ── Secrets (wrangler secret put <NAME>) ──
  /** Zalo App secret: appsecret_proof for graph.zalo.me /me. */
  ZALO_APP_SECRET?: string;
  /** HS256 key for guest JWTs. */
  JWT_SECRET?: string;
  /** Zalo OA access token used for ZNS (business.openapi.zalo.me). */
  ZALO_OA_ACCESS_TOKEN?: string;
  /** Approved ZNS template id for "approaching turn". */
  ZNS_TEMPLATE_APPROACHING_ID?: string;
  /** Set to "1" to send ZNS in development mode (mode: "development"). */
  ZNS_DEVELOPMENT_MODE?: string;
};

/** Production Zalo Mini App origin + local dev origins. */
export const CORS_ORIGINS = [
  'https://h5.zdn.vn',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function allowedOrigin(origin: string, env: Env): string | null {
  const extra = (env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return CORS_ORIGINS.includes(origin) || extra.includes(origin) ? origin : null;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  // WebSocket upgrades are not subject to CORS (and 101 headers are immutable).
  if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') return next();
  return cors({
    origin: (origin) => allowedOrigin(origin, c.env),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true, service: 'luotdi-api' }));

app.route('/api/auth', auth);
app.route('/api/tickets', tickets);
app.route('/api/host', host);
app.route('/api/branches', branches);
app.route('/api/webhooks', webhooks);
app.route('/api/admin', admin);
app.route('/api/client', client);
app.route('/api/manage', manage);
app.route('/api/super-admin', superAdmin);

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
