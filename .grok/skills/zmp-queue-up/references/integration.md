# Integrating zmp-sdk / zmp-ui into apps/zalo-mini-app

## Packages

```sh
pnpm --filter zalo-mini-app add zmp-sdk zmp-ui
pnpm --filter zalo-mini-app add -D zmp-vite-plugin
npm i -g zmp-cli   # or VS Code Zalo Mini App Extension
```

⚠️ Version compatibility of `zmp-ui` with **React 19** and `zmp-vite-plugin` with **Vite 6**
is unverified. Official templates (github.com/Zalo-MiniApp) have historically pinned React 18
and Vite 5. Before committing: run `pnpm build`, `zmp start -D` on a real phone, and a
Development deploy. If zmp-ui breaks on React 19, keep our own `@luotdi/ui-braun` components
and use **only zmp-sdk** (zmp-ui is optional).

The CLI docs still say Device mode needs "Vite 2.x" ✅ (text verified) — this is believed to be
stale; test Device mode before downgrading anything.

## vite.config.ts (sketch)

```ts
import react from '@vitejs/plugin-react';
import zaloMiniApp from 'zmp-vite-plugin'; // ⚠️ confirm default export name in package README
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '',                 // relative asset paths inside Zalo ⚠️ match official template
  plugins: [zaloMiniApp(), react()],
  build: { target: 'es2015' }, // default Zalo target; raise only if a dep needs it
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, ws: true } } },
  test: { environment: 'jsdom', include: ['src/**/*.{test,spec}.{ts,tsx}'], setupFiles: ['./src/test/setup.ts'] },
});
```

Keep the proxy for `pnpm dev` in a browser only. In Zalo, all calls use `import.meta.env.VITE_API_BASE`
(e.g. `https://api.luotdi.vn`). Add a tiny `src/lib/api.ts` that prefixes every fetch and
derives the WebSocket URL from it (replaces `window.location.host` in `useQueueSocket.ts`).

## Routing recommendation

**Keep react-router 7, switch to `MemoryRouter`.**

- Existing pages and `customer-flow.spec.tsx` already use `react-router-dom` (`MemoryRouter` in tests).
- ZMPRouter is a wrapper of BrowserRouter; BrowserRouter works only with the correct `basename` ✅.
  MemoryRouter avoids basename problems entirely ✅.
- Trade-off ✅: MemoryRouter has no default back button in the Zalo header → set
  `"actionBarHidden": true` in `app-config.json` and render our own header with a back button
  (we already render a custom header in `App.tsx`).
- Initial route comes from launch params (see `entry-and-sharing.md`), not the URL path.

```tsx
// App.tsx
const initial = resolveInitialRoute(); // '/b/<qrToken>' | '/ticket/<id>' | '/'
<MemoryRouter initialEntries={[initial]}>
  <Routes>…unchanged…</Routes>
</MemoryRouter>
```

If later you adopt zmp-ui page transitions: `<ZMPRouter memoryRouter>` + `AnimationRoutes` is the
zmp-ui equivalent ✅ (`memoryRouter` prop exists). Note zmp-ui's `useNavigate` adds `animate` /
`direction` options; react-router's hook ignores them.

## Identity hook

Replace `useZaloIdentity.ts` with: `zmp-sdk` → `getAccessToken()` → `POST /api/auth/zalo` →
store the returned JWT in memory + zmp native storage. In plain browser dev (`pnpm dev`), keep a
dev-only stub guarded by `import.meta.env.DEV` that calls a dev auth endpoint enabled only when
the Worker has `ENVIRONMENT=dev`. Never ship the UUID fallback.

## app-config.json target

```json
{
  "app": {
    "title": "LượtĐi",
    "headerTitle": { "vi": "LượtĐi", "en": "LuotDi" },
    "headerColor": "#111111",
    "textColor": "white",
    "actionBarHidden": true,
    "selfControlLoading": false
  }
}
```

Property meanings: `../../zmp/references/app-config.md`.
