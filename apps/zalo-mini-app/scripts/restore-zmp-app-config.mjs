#!/usr/bin/env node
/** Restore root app-config.json from app-config.base.json (drop hashed build paths). */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'app-config.base.json');
const dest = join(root, 'app-config.json');
if (!existsSync(base)) {
  console.error('Missing app-config.base.json');
  process.exit(1);
}
copyFileSync(base, dest);
console.log('Restored app-config.json from app-config.base.json');
