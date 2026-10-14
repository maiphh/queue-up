/**
 * Zalo identity for ticket issuance.
 * Uses window Zalo Mini App bridge when present; otherwise a stable local-dev UUID.
 */

import { useEffect, useState } from 'react';

export type ZaloIdentity = {
  zaloUserId: string;
  customerName: string;
  ready: boolean;
};

const STORAGE_KEY = 'luotdi.dev.zaloUserId';

type ZmpBridge = {
  getUserInfo?: () => Promise<{
    id?: string;
    name?: string;
  }>;
};

function readOrCreateDevId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now().toString(36)}`;
  }
}

function getZmpBridge(): ZmpBridge | null {
  const w = window as Window & { zmp?: ZmpBridge; my?: ZmpBridge };
  return w.zmp ?? w.my ?? null;
}

export function useZaloIdentity(): ZaloIdentity {
  const [identity, setIdentity] = useState<ZaloIdentity>({
    zaloUserId: '',
    customerName: 'Guest',
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const bridge = getZmpBridge();
      if (bridge?.getUserInfo) {
        try {
          const info = await bridge.getUserInfo();
          if (!cancelled && info?.id) {
            setIdentity({
              zaloUserId: info.id,
              customerName: info.name ?? 'Guest',
              ready: true,
            });
            return;
          }
        } catch {
          /* fall through to local UUID */
        }
      }

      if (cancelled) return;
      setIdentity({
        zaloUserId: readOrCreateDevId(),
        customerName: 'Guest',
        ready: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return identity;
}
