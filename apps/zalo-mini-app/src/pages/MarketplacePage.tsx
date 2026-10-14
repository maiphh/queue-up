/**
 * Marketplace discovery — `/`.
 * Nearby branches, waiting counts, category filters.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  TabularMetric,
} from '@luotdi/ui-braun';

type MarketplaceBranch = {
  id: string;
  name: string;
  category: string;
  waitingCount: number;
  district: string;
  /** QR token for `/b/:qrToken` check-in deep link */
  qrToken?: string;
};

type CategoryFilter = 'ALL' | 'RESTAURANT' | 'CLINIC' | 'CAFE';

const CATEGORIES: CategoryFilter[] = [
  'ALL',
  'RESTAURANT',
  'CLINIC',
  'CAFE',
];

export function MarketplacePage() {
  const [branches, setBranches] = useState<MarketplaceBranch[]>([]);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch('/api/branches');
        if (!res.ok) {
          if (!cancelled) setError('Failed to load branches');
          return;
        }
        const data = (await res.json()) as { branches: MarketplaceBranch[] };
        if (!cancelled) setBranches(data.branches ?? []);
      } catch {
        if (!cancelled) setError('Failed to load branches');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (category === 'ALL') return branches;
    return branches.filter((b) => b.category === category);
  }, [branches, category]);

  return (
    <BraunChassis className="m-4 flex flex-col gap-3 p-4">
      <header>
        <h1 className="font-sans text-xl font-semibold text-carbon">
          Marketplace
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          01 / NEARBY BRANCHES
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {CATEGORIES.map((label) => (
          <KeycapButton
            key={label}
            variant={category === label ? 'primary' : 'secondary'}
            className="min-h-[40px] px-3 text-xs"
            onClick={() => setCategory(label)}
          >
            {label}
          </KeycapButton>
        ))}
      </div>

      {error ? (
        <p className="font-mono text-xs text-signal-orange">{error}</p>
      ) : null}

      <ul
        data-testid="marketplace-branch-list"
        className="flex list-none flex-col gap-2 p-0"
      >
        {filtered.map((branch) => (
          <li key={branch.id}>
            <GridCell label={branch.category}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-sans text-sm font-semibold text-carbon">
                    {branch.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                    {branch.district}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                    WAITING
                  </span>
                  <TabularMetric
                    size="lg"
                    value={String(branch.waitingCount)}
                  />
                </div>
              </div>
              <Link
                to={`/b/${branch.qrToken ?? branch.id}`}
                className="mt-2 inline-block font-mono text-[10px] uppercase tracking-widest text-carbon underline"
              >
                OPEN
              </Link>
            </GridCell>
          </li>
        ))}
      </ul>
    </BraunChassis>
  );
}
