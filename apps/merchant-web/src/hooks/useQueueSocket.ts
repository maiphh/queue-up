/**
 * Live queue WebSocket for merchant Host / TV.
 * Connects to GET /api/branches/:branchId/ws, sends HELLO, and reconnects with
 * backoff (1s → 30s) so a TV left on all day recovers from network blips.
 */

import { useEffect, useRef, useState } from 'react';
import type { WsServerEvent } from '@luotdi/shared';

export type UseQueueSocketOptions = {
  branchId?: string;
  role?: 'HOST' | 'TV';
  onEvent?: (event: WsServerEvent) => void;
};

export type UseQueueSocketResult = {
  connected: boolean;
};

function wsUrlForBranch(branchId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/branches/${branchId}/ws`;
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export function useQueueSocket(opts: UseQueueSocketOptions = {}): UseQueueSocketResult {
  const { branchId, role = 'TV', onEvent } = opts;
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!branchId || typeof WebSocket === 'undefined') {
      setConnected(false);
      return;
    }

    let closed = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (closed) return;
      retry = setTimeout(connect, reconnectDelayMs(attempt));
      attempt += 1;
    };

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrlForBranch(branchId!));
      } catch {
        setConnected(false);
        schedule();
        return;
      }
      ws.addEventListener('open', () => {
        if (closed || !ws) return;
        attempt = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'HELLO', role, branchId }));
      });
      ws.addEventListener('message', (ev) => {
        try {
          onEventRef.current?.(JSON.parse(String(ev.data)) as WsServerEvent);
        } catch {
          /* ignore malformed */
        }
      });
      ws.addEventListener('close', () => {
        if (closed) return;
        setConnected(false);
        schedule();
      });
      ws.addEventListener('error', () => {
        if (!closed) setConnected(false);
      });
    }

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      setConnected(false);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, [branchId, role]);

  return { connected };
}
