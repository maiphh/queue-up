import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Zalo Mini App deploy notes (docs.zaloplatforms.com convert-web-app):
 * - base must be relative (`./`) so CDN paths under /zapps/<id>/<ver>/ resolve
 * - outDir `www` matches `zmp deploy --existing -o www`
 * - entry/chunk names need `.module.js` for Zalo's module loader
 * - Zalo replaces index.html; listSyncJS/listCSS come from sync-zmp-assets.mjs
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'www',
    emptyOutDir: true,
    target: 'es2015',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].module.js',
        chunkFileNames: 'assets/[name].[hash].module.js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
