/**
 * Live queue WebSocket for a branch / ticket.
 * RED stub — GREEN: connect to GET /api/branches/:branchId/ws, HELLO as CUSTOMER.
 */

import type { WsServerEvent } from '@luotdi/shared';

export type UseQueueSocketOptions = {
  branchId?: string;
  ticketId?: string;
  onEvent?: (event: WsServerEvent) => void;
};

export type UseQueueSocketResult = {
  connected: boolean;
};

export function useQueueSocket(_opts: UseQueueSocketOptions = {}): UseQueueSocketResult {
  return { connected: false };
}
