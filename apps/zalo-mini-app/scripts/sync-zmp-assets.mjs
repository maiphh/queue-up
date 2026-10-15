#!/usr/bin/env node
/**
 * After `vite build` → www/, fill listCSS / listSyncJS.
 *
 * zmp-cli (`--existing`) reads ROOT `app-config.json` first (not www/).
 * It throws msg.no-asset-defined when listSyncJS and listAsyncJS are both empty.
 * So we must write the hashed entry paths into the root config as well as www/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
const assetsDir = join(www, 'assets');
const srcConfigPath = join(root, 'app-config.json');
const outConfigPath = join(www, 'app-config.json');
const baseConfigPath = join(root, 'app-config.base.json');

if (!existsSync(assetsDir)) {
  console.error(`Missing ${assetsDir}. Run vite build first.`);
  process.exit(1);
}

// Prefer clean base (no hashed paths) so re-sync does not stack old hashes.
const configPath = existsSync(baseConfigPath) ? baseConfigPath : srcConfigPath;
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const files = readdirSync(assetsDir);

const cssFiles = files.filter((f) => f.endsWith('.css')).map((f) => `assets/${f}`);
const jsFiles = files.filter((f) => f.endsWith('.js'));

const entryJs = jsFiles
  .filter((f) => f.startsWith('index.') && f.endsWith('.module.js'))
  .map((f) => `assets/${f}`);
const syncJs =
  entryJs.length > 0
    ? entryJs
    : jsFiles.filter((f) => f.endsWith('.module.js')).map((f) => `assets/${f}`);

if (syncJs.length === 0) {
  console.error('No entry .module.js under www/assets (listSyncJS would be empty).');
  process.exit(1);
}

const listedCss = Array.isArray(config.listCSS) ? config.listCSS : [];
const externalCss = listedCss.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
if (externalCss.length > 0) {
  console.error(
    'listCSS must be paths relative to www. Zalo rejects absolute URLs with "app-config.json is invalid".',
  );
  console.error(externalCss.join('\n'));
  process.exit(1);
}

const next = {
  ...config,
  listCSS: cssFiles,
  listSyncJS: syncJs,
  listAsyncJS: Array.isArray(config.listAsyncJS) ? config.listAsyncJS : [],
};

const json = `${JSON.stringify(next, null, 2)}\n`;
if (!existsSync(www)) mkdirSync(www, { recursive: true });
writeFileSync(outConfigPath, json, 'utf8');
// zmp deploy --existing reads THIS file from cwd:
writeFileSync(srcConfigPath, json, 'utf8');

console.log('ZMP assets synced → app-config.json + www/app-config.json');
console.log(`  listCSS (${next.listCSS.length}): ${next.listCSS.join(', ')}`);
console.log(`  listSyncJS (${next.listSyncJS.length}): ${next.listSyncJS.join(', ')}`);
