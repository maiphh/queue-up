import { getRouteParams } from 'zmp-sdk';

/**
 * Initial in-app route from Zalo launch params:
 *   https://zalo.me/s/{APP_ID}/?branch={qrToken}  → /b/{qrToken}
 *   https://zalo.me/s/{APP_ID}/?ticket={ticketId} → /ticket/{ticketId}
 * Falls back to the browser query string in `pnpm dev`.
 */
export function resolveInitialRoute(): string {
  let p: Record<string, string> = {};
  try {
    p = getRouteParams() ?? {};
  } catch {
    p = {};
  }
  if (!p.branch && !p.ticket && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    p = { branch: q.get('branch') ?? '', ticket: q.get('ticket') ?? '' };
  }
  if (p.ticket) return `/ticket/${encodeURIComponent(p.ticket)}`;
  if (p.branch) return `/b/${encodeURIComponent(p.branch)}`;
  return '/';
}
