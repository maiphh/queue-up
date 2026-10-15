/**
 * API base for the Worker. Inside Zalo the app is served from https://h5.zdn.vn,
 * so relative `/api/...` URLs would hit Zalo, not our Worker.
 *
 * VITE_API_BASE — absolute Worker origin, e.g. https://api.luotdi.vn (no trailing slash).
 * Empty in `pnpm dev` → relative URLs → Vite proxy to 127.0.0.1:8787.
 */

let sessionToken: string | null = null;

export function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return raw.replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** ws(s):// URL derived from the API base (falls back to the page host in dev). */
export function wsUrl(path: string): string {
  const base = apiBase();
  if (base) return `${base.replace(/^http/i, 'ws')}${path}`;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

/** fetch against the Worker; adds `Authorization: Bearer <jwt>` when signed in. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (sessionToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return fetch(apiUrl(path), { ...init, headers });
}
