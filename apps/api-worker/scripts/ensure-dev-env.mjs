// Cross-platform (Windows/macOS/Linux) pre-step for `pnpm dev`:
//  1. create .dev.vars from .dev.vars.example if missing (ENVIRONMENT=dev, JWT_SECRET)
//  2. create + seed the local D1 database on first run
import { copyFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devVars = resolve(root, '.dev.vars');
const example = resolve(root, '.dev.vars.example');

if (!existsSync(devVars)) {
  copyFileSync(example, devVars);
  console.log('[dev] Created apps/api-worker/.dev.vars from .dev.vars.example');
} else {
  const text = readFileSync(devVars, 'utf-8');
  const missing = ['ENVIRONMENT', 'JWT_SECRET'].filter(
    (k) => !new RegExp(`^\\s*${k}\\s*=`, 'm').test(text),
  );
  if (missing.length) {
    const defaults = Object.fromEntries(
      readFileSync(example, 'utf-8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l]),
    );
    appendFileSync(devVars, `\n${missing.map((k) => defaults[k]).join('\n')}\n`);
    console.log(`[dev] Added ${missing.join(', ')} to .dev.vars`);
  }
}

if (!existsSync(resolve(root, '.wrangler/state/v3/d1'))) {
  console.log('[dev] No local D1 yet: applying schema + seed');
  const r = spawnSync('node', ['./scripts/reset-local-d1.mjs'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
