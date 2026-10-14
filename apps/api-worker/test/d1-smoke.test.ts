import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

async function applySchema(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

describe('D1 harness smoke', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  it('runs SELECT 1 against isolated in-memory D1', async () => {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    expect(row?.ok).toBe(1);
  });

  it('applies schema and exposes merchants table', async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'merchants'",
    ).first<{ name: string }>();
    expect(row?.name).toBe('merchants');
  });

  it('exposes tickets queue-order index', async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tickets_queue_order'",
    ).first<{ name: string }>();
    expect(row?.name).toBe('idx_tickets_queue_order');
  });
});
