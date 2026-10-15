/**
 * Guest identity: zmp-sdk getAccessToken() → POST /api/auth/zalo → JWT.
 * The JWT is kept in memory (and zmp native storage) and sent as a Bearer
 * header by `apiFetch`. No localStorage / client-chosen user ids.
 *
 * Browser dev (`pnpm dev`, outside Zalo): falls back to POST /api/auth/dev,
 * which the Worker only enables when ENVIRONMENT=dev. Production builds never
 * take that path.
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
/** SDK/bridge calls must not hang the UI forever. */
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

async function signIn(): Promise<AuthResponse> {
  let accessToken: string | null = null;
  try {
    accessToken = await withTimeout(getAccessToken(), IDENTITY_TIMEOUT_MS);
  } catch {
    accessToken = null;
  }
  if (accessToken) {
    return withTimeout(exchange('/api/auth/zalo', { accessToken }), IDENTITY_TIMEOUT_MS);
  }
  if (import.meta.env.DEV) {
    return withTimeout(exchange('/api/auth/dev', {}), IDENTITY_TIMEOUT_MS);
  }
  throw new Error('no zalo access token');
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
