/**
 * Merchant home — lists seeded branches with deep links into Host / TV / Admin.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BraunChassis, GridCell, KeycapButton, TabularMetric } from '@luotdi/ui-braun';

type BranchCard = {
  id: string;
  name: string;
  category: string;
  waitingCount: number;
  district: string;
  qrToken?: string;
  merchantSlug?: string;
};

type SnapshotLite = {
  waitingCount: number;
  queueStatus: string;
  tickets: Array<{ status: string }>;
};

export function HomePage() {
  const [branches, setBranches] = useState<BranchCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/branches');
        if (!res.ok) {
          if (!cancelled) {
            setError(
              'API unavailable. Start the worker: pnpm --filter api-worker dev',
            );
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { branches: BranchCard[] };
        const list = data.branches ?? [];

        // Enrich with merchant slug via snapshot/admin is heavy; derive from known seed QR map
        const enriched = await Promise.all(
          list.map(async (b) => {
            try {
              const snap = await fetch(`/api/branches/${b.id}/snapshot`);
              if (!snap.ok) return b;
              const s = (await snap.json()) as SnapshotLite;
              return { ...b, waitingCount: s.waitingCount };
            } catch {
              return b;
            }
          }),
        );

        // Resolve TV slug from admin config per branch
        const withSlugs = await Promise.all(
          enriched.map(async (b) => {
            try {
              const cfg = await fetch(
                `/api/admin/config?branchId=${encodeURIComponent(b.id)}`,
              );
              if (!cfg.ok) return b;
              const c = (await cfg.json()) as { merchantSlug?: string };
              return { ...b, merchantSlug: c.merchantSlug };
            } catch {
              return b;
            }
          }),
        );

        if (!cancelled) {
          setBranches(withSlugs);
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(
            'Cannot reach /api. Is the worker on :8787 and was Vite restarted after the proxy change?',
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-chassis">
      <header className="border-b border-grid bg-ink px-4 py-3 text-panel">
        <h1 className="font-mono text-sm tracking-widest tabular">
          LUOTDI / MERCHANT
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-panel/70">
          Local demo console
        </p>
      </header>

      <section className="m-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Link to="/admin">
            <KeycapButton variant="secondary">OWNER ADMIN</KeycapButton>
          </Link>
          <Link to="/super-admin">
            <KeycapButton variant="secondary">SUPER ADMIN</KeycapButton>
          </Link>
        </div>

        {loading ? (
          <BraunChassis className="p-4">
            <p className="font-mono text-xs text-graphite tabular">LOADING BRANCHES</p>
          </BraunChassis>
        ) : null}

        {error ? (
          <BraunChassis className="p-4">
            <p className="font-mono text-xs text-signal-orange">{error}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-graphite">
              Quick check: curl http://127.0.0.1:8787/health
            </p>
          </BraunChassis>
        ) : null}

        {!loading && !error && branches.length === 0 ? (
          <BraunChassis className="p-4">
            <p className="font-mono text-xs text-graphite">
              No branches in D1. Run: pnpm --filter api-worker db:seed
            </p>
          </BraunChassis>
        ) : null}

        <ul className="flex list-none flex-col gap-3 p-0">
          {branches.map((branch) => (
            <li key={branch.id}>
              <GridCell label={branch.category}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm font-semibold text-carbon">
                      {branch.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                      {branch.district} / {branch.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                      WAITING
                    </p>
                    <TabularMetric size="lg" value={String(branch.waitingCount)} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/host/${branch.id}`}>
                    <KeycapButton variant="primary">HOST POS</KeycapButton>
                  </Link>
                  {branch.merchantSlug ? (
                    <Link to={`/tv/${branch.merchantSlug}`}>
                      <KeycapButton variant="secondary">TV</KeycapButton>
                    </Link>
                  ) : null}
                  <Link to={`/admin/${branch.id}`}>
                    <KeycapButton variant="secondary">ADMIN</KeycapButton>
                  </Link>
                </div>
              </GridCell>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
