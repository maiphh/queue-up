/**
 * Live queue WebSocket for merchant Host / TV.
 * RED stub — GREEN: connect to GET /api/branches/:branchId/ws, HELLO as TV|HOST.
 */

import type { WsServerEvent } from '@luotdi/shared';

export type UseQueueSocketOptions = {
  branchId?: string;
  role?: 'HOST' | 'TV';
  onEvent?: (event: WsServerEvent) => void;
};

export type UseQueueSocketResult = {
  connected: boolean;
};

export function useQueueSocket(
  _opts: UseQueueSocketOptions = {},
): UseQueueSocketResult {
  return { connected: false };
}
