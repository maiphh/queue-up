/**
 * Super-Admin God Mode — `/super-admin`.
 * Impersonate branch, override plan_tier FREE<->PRO, force-clear stuck queues.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BraunChassis,
  KeycapButton,
  LedIndicator,
  TabularMetric,
} from '@luotdi/ui-braun';

type SuperBranch = {
  id: string;
  name: string;
  merchantId: string;
  merchantSlug: string;
  merchantName: string;
  planTier: 'FREE' | 'PRO' | string;
  waitingCount: number;
};

type SuperSnapshot = {
  branches: SuperBranch[];
};

export function SuperAdminPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<SuperSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/branches');
      if (!res.ok) {
        setError('Failed to load super-admin');
        return;
      }
      const data = (await res.json()) as SuperSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError('Failed to load super-admin');
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const impersonate = useCallback(
    async (branch: SuperBranch) => {
      try {
        await fetch(`/api/super-admin/branches/${branch.id}/impersonate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: branch.id }),
        });
      } catch {
        /* mock-safe */
      }
      navigate(`/host/${branch.id}`);
    },
    [navigate],
  );

  const setPlanTier = useCallback(
    async (branch: SuperBranch, planTier: 'FREE' | 'PRO') => {
      try {
        await fetch(`/api/super-admin/merchants/${branch.merchantId}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: branch.merchantId,
            planTier,
          }),
        });
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            branches: prev.branches.map((b) =>
              b.merchantId === branch.merchantId ? { ...b, planTier } : b,
            ),
          };
        });
      } catch {
        /* mock-safe */
      }
    },
    [],
  );

  const forceClear = useCallback(async (branch: SuperBranch) => {
    try {
      await fetch(`/api/super-admin/branches/${branch.id}/force-clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branch.id }),
      });
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          branches: prev.branches.map((b) =>
            b.id === branch.id ? { ...b, waitingCount: 0 } : b,
          ),
        };
      });
    } catch {
      /* mock-safe */
    }
  }, []);

  if (error && !snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-xs text-graphite tabular">LOADING</p>
      </BraunChassis>
    );
  }

  return (
    <div
      data-page="super-admin"
      className="flex min-h-screen flex-col bg-chassis text-carbon"
    >
      <section
        data-testid="super-admin-panel"
        className="m-4 border border-grid bg-panel p-4"
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-grid pb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
              SUPER-ADMIN
            </p>
            <h1 className="font-sans text-base font-semibold tracking-wide">
              GOD MODE
            </h1>
          </div>
          <LedIndicator state="warning" />
        </header>

        <div data-testid="branch-list" className="flex flex-col gap-3">
          {snapshot.branches.map((branch) => {
            const nextTier = branch.planTier === 'PRO' ? 'FREE' : 'PRO';
            return (
              <article
                key={branch.id}
                data-testid={`branch-row-${branch.id}`}
                className="flex flex-wrap items-center justify-between gap-3 border border-grid bg-chassis px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-semibold">
                    {branch.name}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                    {branch.merchantName} / {branch.merchantSlug}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <span className="border border-grid bg-panel px-2 py-0.5 font-mono text-xs uppercase tabular">
                      {branch.planTier}
                    </span>
                    <span className="font-mono text-xs text-graphite tabular">
                      WAITING{' '}
                      <TabularMetric
                        size="md"
                        value={String(branch.waitingCount)}
                      />
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <KeycapButton
                    variant="primary"
                    onClick={() => void impersonate(branch)}
                  >
                    IMPERSONATE
                  </KeycapButton>
                  <KeycapButton
                    variant="secondary"
                    onClick={() => void setPlanTier(branch, nextTier)}
                  >
                    {nextTier === 'PRO' ? 'SET PRO' : 'SET FREE'}
                  </KeycapButton>
                  <KeycapButton
                    variant="danger"
                    onClick={() => void forceClear(branch)}
                  >
                    FORCE CLEAR
                  </KeycapButton>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
