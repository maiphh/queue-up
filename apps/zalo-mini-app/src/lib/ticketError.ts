import { guestCopy } from '@luotdi/shared';

/** Map a failed POST /api/tickets to its own guest-facing message. */
export async function ticketErrorMessage(res: Response | null): Promise<string> {
  const e = guestCopy.ticketErrors;
  if (!res) return e.NETWORK!;
  if (res.status === 401) return e.UNAUTHORIZED!;
  let code: string | undefined;
  try {
    code = ((await res.json()) as { code?: string }).code;
  } catch {
    code = undefined;
  }
  return (code && e[code]) || e.UNKNOWN!;
}
