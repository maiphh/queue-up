/**
 * Guest identity: zmp-sdk getAccessToken() → POST /api/auth/zalo → JWT.
 * The JWT is kept in memory (and zmp native storage) and sent as a Bearer
 * header by `apiFetch`. No localStorage / client-chosen user ids.
 *
 * Browser dev (`pnpm dev`, outside Zalo): falls back to POST /api/auth/dev,
 * automatically (DEV or VITE_SKIP_ZALO_AUTH=1, and not inside Zalo); `?as=<name>`
 * picks a test guest. The Worker only serves that route when ENVIRONMENT=dev.
 */

import { useCallback, useEffect, useState } from 'react';
import { getAccessToken, nativeStorage } from 'zmp-sdk';
import { apiFetch, setSessionToken } from '../lib/api';

export type ZaloIdentityStatus = 'loading' | 'ready' | 'error';

export type ZaloIdentity = {
  status: ZaloIdentityStatus;
  ready: boolean;
  customerName: string;
  error: string | null;
  retry: () => void;
};

const TOKEN_KEY = 'luotdi.session';
/** One overall budget for the whole sign-in (SDK + Worker exchange). */
export const IDENTITY_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number; name?: string };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readCachedToken(): string | null {
  try {
    const t = nativeStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    const exp = decodeExp(t);
    return exp && exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

function cacheToken(token: string): void {
  try {
    nativeStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* not inside Zalo — memory only */
  }
}

type AuthResponse = { token: string; guest: { name: string | null } };

async function exchange(path: string, body: unknown): Promise<AuthResponse> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return (await res.json()) as AuthResponse;
}

/** Dev bypass is compiled in only for `vite` dev or VITE_SKIP_ZALO_AUTH=1. */
export function devBypassEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SKIP_ZALO_AUTH === '1';
}

/** True inside the Zalo app / Zalo webview (the SDK bridge is available). */
export function isInsideZalo(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /zalo/i.test(navigator.userAgent);
}

/** `?as=<name>` picks a test guest in browser dev (e.g. ?as=lan, ?as=minh). */
export function devGuestFromUrl(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get('as');
    return v && v.trim() ? v.trim().slice(0, 64) : null;
  } catch {
    return null;
  }
}

async function signInSteps(): Promise<AuthResponse> {
  // Browser dev outside Zalo: skip the SDK entirely (still under signIn's single deadline).
  if (devBypassEnabled() && !isInsideZalo()) {
    const as = devGuestFromUrl();
    return exchange('/api/auth/dev', as ? { devUserId: as } : {});
  }
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken();
  } catch {
    accessToken = null;
  }
  if (accessToken) return exchange('/api/auth/zalo', { accessToken });
  throw new Error('no zalo access token');
}

/** Whole sign-in shares a single 10s deadline (not 10s per step). */
export function signIn(timeoutMs = IDENTITY_TIMEOUT_MS): Promise<AuthResponse> {
  return withTimeout(signInSteps(), timeoutMs);
}

export function useZaloIdentity(): ZaloIdentity {
  const [state, setState] = useState<{
    status: ZaloIdentityStatus;
    customerName: string;
    error: string | null;
  }>({ status: 'loading', customerName: 'Khách', error: null });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading', error: null }));

    const cached = attempt === 0 ? readCachedToken() : null;
    if (cached) {
      setSessionToken(cached);
      setState({ status: 'ready', customerName: 'Khách', error: null });
      return;
    }

    void signIn()
      .then(({ token, guest }) => {
        if (cancelled) return;
        setSessionToken(token);
        cacheToken(token);
        setState({ status: 'ready', customerName: guest.name ?? 'Khách', error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setSessionToken(null);
        setState({
          status: 'error',
          customerName: 'Khách',
          error: 'Không xác thực được tài khoản Zalo.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, ready: state.status === 'ready', retry };
}
