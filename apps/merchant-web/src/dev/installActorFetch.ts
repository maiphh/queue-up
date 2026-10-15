import { readDevActor } from './actor';

let installed = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Wrap window.fetch once so /api/ calls carry the current dev actor headers. */
export function installActorFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url.includes('/api/')) {
      return originalFetch(input, init);
    }

    const actor = readDevActor();
    const headers = new Headers(
      init?.headers ??
        (input instanceof Request ? input.headers : undefined),
    );
    headers.set('X-Dev-Actor', actor.role);
    headers.set('X-Test-Staff-Role', actor.role);
    if (actor.clientId) {
      headers.set('X-Dev-Client-Id', actor.clientId);
    } else {
      headers.delete('X-Dev-Client-Id');
    }
    if (actor.branchId) {
      headers.set('X-Dev-Branch-Id', actor.branchId);
    } else {
      headers.delete('X-Dev-Branch-Id');
    }

    return originalFetch(input, { ...init, headers });
  };
}
