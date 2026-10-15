import { devHeadersEnabled, readStaffSession } from '../auth/staffSession';
import { readDevActor } from './actor';

let installed = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Staff-only API paths: a 401 here (outside dev) sends the user to /login. */
const STAFF_API = /\/api\/(manage|client|admin|super-admin|host)\/|\/api\/branches\/[^/]+\/(snapshot|pause)/;

/**
 * Wrap window.fetch once so /api/ calls carry the staff session:
 * - `Authorization: Bearer <staff JWT>` when signed in (real auth, all builds);
 * - plus the dev actor headers in dev builds only, when no session exists.
 */
export function installActorFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url.includes('/api/') || url.includes('/api/auth/')) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ??
        (input instanceof Request ? input.headers : undefined),
    );
    const session = readStaffSession();
    if (session && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${session.token}`);
    }
    const dev = devHeadersEnabled();
    if (dev && !session) {
      const actor = readDevActor();
      headers.set('X-Dev-Actor', actor.role);
      headers.set('X-Test-Staff-Role', actor.role);
      if (actor.clientId) headers.set('X-Dev-Client-Id', actor.clientId);
      else headers.delete('X-Dev-Client-Id');
      if (actor.branchId) headers.set('X-Dev-Branch-Id', actor.branchId);
      else headers.delete('X-Dev-Branch-Id');
    }

    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401 && !dev && STAFF_API.test(url) && !location.pathname.startsWith('/login')) {
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
    return res;
  };
}
