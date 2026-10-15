# Testing, CI deploy, Vietnamese i18n

## Mock zmp-sdk in vitest

```ts
// src/test/setup.ts (add)
import { vi } from 'vitest';
vi.mock('zmp-sdk', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
  getUserInfo: vi.fn().mockResolvedValue({ userInfo: { id: 'zid-1', name: 'Khách Test', idByOA: undefined } }),
  getPhoneNumber: vi.fn().mockResolvedValue({ token: 'phone-token' }),
  getLocation: vi.fn().mockResolvedValue({ token: 'loc-token' }),
  getRouteParams: vi.fn().mockReturnValue({}),
  followOA: vi.fn().mockResolvedValue(undefined),
  requestSendNotification: vi.fn().mockResolvedValue(undefined),
  scanQRCode: vi.fn().mockResolvedValue({ content: 'https://zalo.me/s/APPID/?branch=qr-pho24-nguyen-hue' }),
  openShareSheet: vi.fn().mockResolvedValue({}),
  showToast: vi.fn(),
  events: { on: vi.fn(), off: vi.fn(), once: vi.fn() },
  EventName: { AppPaused: 'AppPaused', AppResumed: 'AppResumed', OpenApp: 'OpenApp' },
}));
```

Prefer wrapping SDK calls in `src/lib/zalo.ts` and mocking that module — easier per-test overrides.
Add specs: deny-permission paths, `resolveInitialRoute`, resume → refetch.
Worker: unit-test `/api/auth/zalo` with `fetch` mocked (Graph responses incl. `error != 0`), JWT
required on ticket routes, revoke-consent webhook signature.

Simulator/browser only renders UI; real APIs need Device mode or a Development deploy ✅ (`../../zmp/references/troubleshooting.md`).

## Manual test matrix (before each Testing deploy)

QR scan from Zalo camera (cold start + app already open) · ticket → close app → manager calls →
OA/ZNS arrives · deny every permission · iOS + Android · slow 3G · Vietnamese text overflow.

## CI deploy (GitHub Actions, ⚠️ verify flags with `zmp deploy --help`)

```yaml
# .github/workflows/zmp-deploy.yml (sketch)
on: { push: { branches: [master] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile && pnpm test && pnpm --filter zalo-mini-app build
      - run: npm i -g zmp-cli
      - working-directory: apps/zalo-mini-app
        env:
          ZALO_APP_ID: ${{ secrets.ZALO_APP_ID }}          # Zalo App ID, NOT Mini App ID ✅
          ZALO_APP_SECRET: ${{ secrets.ZALO_APP_SECRET }}
          ZALO_REFRESH_TOKEN: ${{ secrets.ZALO_REFRESH_TOKEN }}
        run: zmp login && zmp deploy   # default Development; Testing for review builds ⚠️ flag
```

Env var names come from `../../zmp/references/troubleshooting.md` / the official CI blog ✅;
exact non-interactive flags ⚠️. Watch quotas (~300 Development / ~60 Testing per 30 days) — deploy
Development on master, Testing only on release tags. Worker: `wrangler deploy` + `wrangler d1 migrations apply`.
Set `VITE_API_BASE` per environment at build time.

## Vietnamese i18n

- Guest copy already lives in `@luotdi/shared` (`guestCopy`). Keep all strings there; no inline literals.
- Vietnamese is the default; English optional. Locale from `getSystemInfo()` ⚠️ (field name e.g. `language` unverified) or a toggle.
- `app-config.json` `headerTitle` accepts `{ vi, en }` ✅ (older Zalo falls back to `vi`).
- Use `Intl.NumberFormat('vi-VN')` / `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })`.
- Fonts must render full Vietnamese diacritics (check `ui-braun` mono font for ư/ơ/ạ…).
- ZNS / OA templates are in Vietnamese and must match the in-app wording.
