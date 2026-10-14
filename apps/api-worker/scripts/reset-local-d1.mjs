import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1State = resolve(root, '.wrangler/state/v3/d1');

function run(script) {
  const result = spawnSync('pnpm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runWranglerFile(file) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'luotdi-db', '--local', `--file=${file}`],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Prefer deleting local D1 files; if Windows locks them (workerd), wipe via SQL. */
let wipedFiles = false;
try {
  rmSync(d1State, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  wipedFiles = true;
  console.log('Cleared local D1 state directory.');
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
  console.warn(
    `Could not delete ${d1State} (${code || err}). Falling back to SQL wipe.`,
  );
  console.warn(
    'Tip: stop `pnpm --filter api-worker dev` (workerd) if resets keep failing.',
  );
}

if (wipedFiles) {
  run('db:schema');
} else {
  runWranglerFile('src/db/wipe.sql');
  run('db:schema');
}

run('db:seed');
console.log('Local D1 reset complete.');
