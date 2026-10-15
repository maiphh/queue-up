/**
 * Marketplace discovery — `/`.
 * Nearby branches, waiting counts, category filters.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { guestCopy } from '@luotdi/shared';
import { BeVe } from '@luotdi/design-d';
import { apiFetch } from '../lib/api';

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

const FILTER_LABEL: Record<CategoryFilter, string> = {
  ALL: guestCopy.filterAll,
  RESTAURANT: guestCopy.filterRestaurant,
  CLINIC: guestCopy.filterClinic,
  CAFE: guestCopy.filterCafe,
};

const CATEGORY_LABEL: Record<string, string> = {
  RESTAURANT: guestCopy.filterRestaurant,
  CLINIC: guestCopy.filterClinic,
  CAFE: guestCopy.filterCafe,
};

export function MarketplacePage() {
  const [branches, setBranches] = useState<MarketplaceBranch[]>([]);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch('/api/branches');
        if (!res.ok) {
          if (!cancelled) setError('Không tải được danh sách.');
          return;
        }
        const data = (await res.json()) as { branches: MarketplaceBranch[] };
        if (!cancelled) setBranches(data.branches ?? []);
      } catch {
        if (!cancelled) setError('Không tải được danh sách.');
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
    <section className="zma-page" data-screen="marketplace">
      <header className="zma-row">
        <BeVe pose="idle" size={48} />
        <h1 className="d-lx zma-h1">{guestCopy.marketplaceTitle}</h1>
      </header>

      <div className="zma-row zma-wrap" role="group" aria-label="Category">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            className={category === value ? 'd-chip d-chip-navy' : 'd-chip'}
            onClick={() => setCategory(value)}
          >
            {FILTER_LABEL[value]}
          </button>
        ))}
      </div>

      {error ? <p className="zma-warn">{error}</p> : null}

      <ul data-testid="marketplace-branch-list" className="zma-list">
        {filtered.map((branch) => (
          <li key={branch.id}>
            <Link to={`/b/${branch.qrToken ?? branch.id}`} className="d-card zma-row zma-between" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div>
                <small className="d-muted">{CATEGORY_LABEL[branch.category] ?? branch.category}</small>
                <p className="d-lx" style={{ margin: 0, fontWeight: 700 }}>{branch.name}</p>
                <small className="d-muted">{branch.district}</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b className="d-num" style={{ fontSize: 28 }}>{branch.waitingCount}</b>
                <br />
                <small className="d-muted">{guestCopy.waiting}</small>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
