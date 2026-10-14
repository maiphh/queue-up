/**
 * Live queue WebSocket for a branch / ticket.
 * Connects to GET /api/branches/:branchId/ws and sends HELLO as CUSTOMER.
 */

import { useEffect, useRef, useState } from 'react';
import type { WsServerEvent } from '@luotdi/shared';

export type UseQueueSocketOptions = {
  branchId?: string;
  ticketId?: string;
  onEvent?: (event: WsServerEvent) => void;
};

export type UseQueueSocketResult = {
  connected: boolean;
};

function wsUrlForBranch(branchId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/branches/${branchId}/ws`;
}

export function useQueueSocket(
  opts: UseQueueSocketOptions = {},
): UseQueueSocketResult {
  const { branchId, ticketId, onEvent } = opts;
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!branchId) {
      setConnected(false);
      return;
    }

    if (typeof WebSocket === 'undefined') {
      setConnected(false);
      return;
    }

    let closed = false;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrlForBranch(branchId));
    } catch {
      setConnected(false);
      return;
    }

    ws.addEventListener('open', () => {
      if (closed || !ws) return;
      setConnected(true);
      const hello = {
        type: 'HELLO' as const,
        role: 'CUSTOMER' as const,
        branchId,
        ...(ticketId ? { ticketId } : {}),
      };
      ws.send(JSON.stringify(hello));
    });

    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as WsServerEvent;
        onEventRef.current?.(data);
      } catch {
        /* ignore malformed */
      }
    });

    ws.addEventListener('close', () => {
      if (!closed) setConnected(false);
    });

    ws.addEventListener('error', () => {
      if (!closed) setConnected(false);
    });

    return () => {
      closed = true;
      setConnected(false);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, [branchId, ticketId]);

  return { connected };
}
