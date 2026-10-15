import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { verifyGuestJwt } from '../src/services/jwt';

async function applySchema(db: D1Database, sql: string): Promise<void> {
  for (const st of sql.split(';').map((s) => s.trim())) {
    if (st.length > 0 && !st.startsWith('--')) await db.prepare(st).run();
  }
}

async function callDev(envOverride: Record<string, unknown>, body: unknown = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request('http://local/api/auth/dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { ...env, ...envOverride } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('POST /api/auth/dev', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  it('is rejected (404) under the production config', async () => {
    const res = await SELF.fetch('http://local/api/auth/dev', { method: 'POST', body: '{}' });
    expect(res.status).toBe(404);
  });

  it('is rejected in production even with a JWT secret and devUserId', async () => {
    for (const ENVIRONMENT of ['production', 'staging', '', undefined]) {
      const res = await callDev({ ENVIRONMENT }, { devUserId: 'mallory' });
      expect(res.status).toBe(404);
    }
  });

  it('issues a JWT for ?as=<name> when ENVIRONMENT=dev', async () => {
    const res = await callDev({ ENVIRONMENT: 'dev' }, { devUserId: 'lan' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; guest: { name: string } };
    expect(json.guest.name).toBe('lan');
    const claims = await verifyGuestJwt(env.JWT_SECRET as string, json.token);
    expect(claims?.zid).toBe('dev:lan');
  });

  it('explains a missing JWT_SECRET instead of a bare 404', async () => {
    const res = await callDev({ ENVIRONMENT: 'dev', JWT_SECRET: undefined });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { code: string }).code).toBe('DEV_MISCONFIGURED');
  });
});
