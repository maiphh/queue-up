import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const zmp = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string>>(),
  getRouteParams: vi.fn<() => Record<string, string>>(() => ({})),
  store: new Map<string, string>(),
}));

vi.mock('zmp-sdk', () => ({
  getAccessToken: zmp.getAccessToken,
  getRouteParams: zmp.getRouteParams,
  nativeStorage: {
    getItem: (k: string) => zmp.store.get(k) ?? '',
    setItem: (k: string, v: string) => void zmp.store.set(k, v),
  },
}));

import { apiFetch, apiUrl, getSessionToken, setSessionToken, wsUrl } from '../lib/api';
import { resolveInitialRoute } from '../lib/initialRoute';
import { IDENTITY_TIMEOUT_MS, useZaloIdentity } from '../hooks/useZaloIdentity';

describe('api base', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    setSessionToken(null);
  });

  it('prefixes VITE_API_BASE and derives wss:// from it', () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.luotdi.vn/');
    expect(apiUrl('/api/branches')).toBe('https://api.luotdi.vn/api/branches');
    expect(wsUrl('/api/branches/b1/ws')).toBe('wss://api.luotdi.vn/api/branches/b1/ws');
  });

  it('falls back to relative URLs in dev', () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(apiUrl('/api/x')).toBe('/api/x');
  });

  it('apiFetch sends Bearer JWT', async () => {
    const f = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', f);
    setSessionToken('jwt-1');
    await apiFetch('/api/tickets', { method: 'POST' });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
  });
});

describe('resolveInitialRoute', () => {
  it('maps launch params to routes', () => {
    zmp.getRouteParams.mockReturnValueOnce({ branch: 'qr-1' });
    expect(resolveInitialRoute()).toBe('/b/qr-1');
    zmp.getRouteParams.mockReturnValueOnce({ ticket: 't 1' });
    expect(resolveInitialRoute()).toBe('/ticket/t%201');
    zmp.getRouteParams.mockReturnValueOnce({});
    expect(resolveInitialRoute()).toBe('/');
  });
});

describe('useZaloIdentity', () => {
  beforeEach(() => {
    zmp.store.clear();
    setSessionToken(null);
    // Pretend to be inside Zalo so the real token exchange path runs.
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Zalo/24.1');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exchanges the Zalo access token for a JWT; no localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    zmp.getAccessToken.mockResolvedValue('zalo-at');
    const f = vi.fn(async () => Response.json({ token: 'a.eyJleHAiOjk5OTk5OTk5OTl9.c', guest: { name: 'Lan' } }));
    vi.stubGlobal('fetch', f);

    const { result } = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.customerName).toBe('Lan');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/zalo$/);
    expect(JSON.parse(String(init.body))).toEqual({ accessToken: 'zalo-at' });
    expect(getSessionToken()).toBe('a.eyJleHAiOjk5OTk5OTk5OTl9.c');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reports error (not a silent hang) when the Worker rejects the token', async () => {
    zmp.getAccessToken.mockResolvedValue('zalo-at');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const { result } = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.ready).toBe(false);
  });

  it('gives up after one overall 10s budget even if each step is slow', async () => {
    vi.useFakeTimers();
    try {
      // getAccessToken takes 6s, the Worker exchange another 6s: 12s total > 10s.
      zmp.getAccessToken.mockImplementation(() => new Promise((r) => setTimeout(() => r('zalo-at'), 6000)));
      vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => setTimeout(() => r(Response.json({ token: 't', guest: { name: null } })), 6000))));
      const { result } = renderHook(() => useZaloIdentity());
      expect(result.current.status).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDENTITY_TIMEOUT_MS - 1);
      });
      expect(result.current.status).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2);
      });
      expect(result.current.status).toBe('error');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useZaloIdentity dev bypass (browser, outside Zalo)', () => {
  beforeEach(() => {
    zmp.store.clear();
    setSessionToken(null);
    zmp.getAccessToken.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  const okFetch = () =>
    vi.fn(async () =>
      Response.json({ token: 'a.eyJleHAiOjk5OTk5OTk5OTl9.c', guest: { name: 'lan' } }),
    );

  it('goes straight to /api/auth/dev without calling the Zalo SDK', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/dev$/);
    expect(JSON.parse(String(init.body))).toEqual({});
    expect(zmp.getAccessToken).not.toHaveBeenCalled();
  });

  it('?as=<name> picks the test guest', async () => {
    window.history.replaceState(null, '', '/?as=lan');
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ devUserId: 'lan' });
    expect(result.current.customerName).toBe('lan');
  });

  it('is off in production builds unless VITE_SKIP_ZALO_AUTH=1', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_SKIP_ZALO_AUTH', '');
    zmp.getAccessToken.mockRejectedValue(new Error('no bridge'));
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(f).not.toHaveBeenCalled();

    vi.stubEnv('VITE_SKIP_ZALO_AUTH', '1');
    const r2 = renderHook(() => useZaloIdentity());
    await waitFor(() => expect(r2.result.current.status).toBe('ready'));
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toMatch(/\/api\/auth\/dev$/);
  });
});
