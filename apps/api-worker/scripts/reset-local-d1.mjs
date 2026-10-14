import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1State = resolve(root, '.wrangler/state/v3/d1');

rmSync(d1State, { recursive: true, force: true });
console.log('Cleared local D1 state.');

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

run('db:schema');
run('db:seed');
console.log('Local D1 reset complete.');
