import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const schemaSql = readFileSync(
  resolve(__dirname, 'src/db/schema.sql'),
  'utf-8',
);

/**
 * BranchQueueRoom WebSocket suite.
 * DO WebSockets need `isolatedStorage: false` (Cloudflare known issue).
 * `singleWorker: true` keeps DO persist paths under Windows MAX_PATH.
 */
export default defineWorkersConfig({
  test: {
    include: ['test/durable-object.spec.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        isolatedStorage: false,
        singleWorker: true,
        miniflare: {
          bindings: {
            TEST_SCHEMA_SQL: schemaSql,
          },
        },
      },
    },
  },
});
