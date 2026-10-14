import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const schemaSql = readFileSync(
  resolve(__dirname, 'src/db/schema.sql'),
  'utf-8',
);

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.{test,spec}.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_SCHEMA_SQL: schemaSql,
          },
        },
      },
    },
  },
});
