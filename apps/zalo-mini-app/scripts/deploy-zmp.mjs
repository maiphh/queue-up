#!/usr/bin/env node
/**
 * Build → sync root app-config (zmp reads cwd) → zmp deploy --existing → restore base config.
 * Usage: node ./scripts/deploy-zmp.mjs [--testing]
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testing = process.argv.includes('--testing');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

let code = run('pnpm', ['build']);
if (code !== 0) process.exit(code);

const zmpArgs = ['deploy', '--existing', '-o', 'www'];
if (testing) zmpArgs.push('--testing');
code = run('zmp', zmpArgs);

// Always restore so hashed asset paths do not stay in git-tracked app-config.json
run('node', ['./scripts/restore-zmp-app-config.mjs']);
process.exit(code);
