/**
 * G1 · Marketplace — `/`. Search, pinned active ticket, category chips, "Gần bạn" list.
 * Distance only after the guest grants Zalo location. Offline shows the last results.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useZaloIdentity } from '../hooks/useZaloIdentity';
import { Link } from 'react-router-dom';
import { guestCopy as g } from '@luotdi/shared';
import { BeVe } from '@luotdi/design-d';
import { apiFetch } from '../lib/api';
import { formatDistance, requestLocation, type LatLng } from '../lib/location';

export type MarketplaceBranch = {
  id: string; name: string; merchantName?: string; category: string; waitingCount: number; district: string; address?: string;
  qrToken?: string; estimatedWaitMins?: number | null; isPaused?: boolean; distanceM?: number | null;
};
type ActiveTicket = { id: string; displayNumber: string; branchName: string; partiesAhead: number; status: string };
type Resp = { branches: MarketplaceBranch[]; activeTicket?: ActiveTicket | null; located?: boolean };

type CategoryFilter = 'ALL' | 'RESTAURANT' | 'CLINIC' | 'CAFE';
const CATEGORIES: CategoryFilter[] = ['ALL', 'RESTAURANT', 'CLINIC', 'CAFE'];
const FILTER_LABEL: Record<CategoryFilter, string> = { ALL: g.filterAll, RESTAURANT: g.filterRestaurant, CLINIC: g.filterClinic, CAFE: g.filterCafe };
const CATEGORY_LABEL: Record<string, string> = { RESTAURANT: g.filterRestaurant, CLINIC: g.filterClinic, CAFE: g.filterCafe };
export const MARKET_CACHE_KEY = 'luotdi.market.v1';

function badge(name: string): string {
  const m = name.match(/[A-Za-zÀ-ỹ]+|\d+/g) ?? ['L'];
  const digits = m.find((x) => /\d/.test(x));
  return (digits ? `${m[0]![0]}${digits}` : m.filter((x) => !/\d/.test(x)).slice(-2).map((w) => w[0]).join('')).toUpperCase().slice(0, 3);
}
const TILE = ['zma-tile-navy', 'zma-tile-green', 'zma-tile-beige'];

export function MarketplacePage() {
  const identity = useZaloIdentity();
  const [data, setData] = useState<Resp | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [q, setQ] = useState('');
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (pos: LatLng | null) => {
    setError(false);
    try {
      const res = await apiFetch(pos ? `/api/branches?lat=${pos.lat}&lng=${pos.lng}` : '/api/branches');
      if (!res.ok) throw new Error();
      const j = (await res.json()) as Resp;
      setData(j);
      setStale(false);
      try { sessionStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ at: Date.now(), branches: j.branches })); } catch { /* storage off */ }
    } catch {
      setError(true);
      try {
        const cached = JSON.parse(sessionStorage.getItem(MARKET_CACHE_KEY) ?? 'null') as { branches: MarketplaceBranch[] } | null;
        if (cached?.branches?.length) { setData((d) => d ?? { branches: cached.branches }); setStale(true); }
      } catch { /* ignore */ }
    }
  }, []);
  // Reload once the guest JWT exists so the pinned active ticket appears.
  useEffect(() => { void load(here); }, [load, identity.ready]);

  async function enableLocation() {
    setLocating(true);
    const pos = await requestLocation();
    setLocating(false);
    if (pos) { setHere(pos); void load(pos); }
  }

  const needle = q.trim().toLocaleLowerCase('vi');
  const filtered = useMemo(() => (data?.branches ?? []).filter((b) =>
    (category === 'ALL' || b.category === category) &&
    (!needle || `${b.name} ${b.merchantName ?? ''} ${b.district}`.toLocaleLowerCase('vi').includes(needle))), [data, category, needle]);
  const active = data?.activeTicket ?? null;

  return (
    <section className="zma-page" data-screen="marketplace">
      <header className="zma-row">
        <BeVe pose="idle" size={52} />
        <div>
          <h1 className="d-lx zma-h1">{g.marketTitle}</h1>
          <small className="d-muted">{here ? g.nearYouCity : g.marketSub}</small>
        </div>
      </header>

      <input className="zma-search" type="search" placeholder={g.searchPlaceholder} aria-label={g.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />

      {active ? (
        <Link to={`/ticket/${active.id}`} className="zma-pinned" data-testid="active-ticket">
          <div>
            <small>{g.yourTicketAt(active.branchName)}</small>
            <b className="d-num">{active.displayNumber}</b>
            <span> · {active.status === 'WAITING' ? g.partiesLeft(active.partiesAhead) : g.calledShort}</span>
          </div>
          <span aria-hidden="true" className="zma-pinned-go">›</span>
        </Link>
      ) : null}

      {error && stale ? (
        <div className="zma-banner zma-banner-plain" role="status" data-testid="market-offline">
          <BeVe pose="offline" size={44} />
          <div><b>{g.marketErrorTitle}</b><p>{g.marketStale}</p></div>
        </div>
      ) : null}

      <div className="zma-row zma-chips" role="group" aria-label={g.categoryLabel}>
        {CATEGORIES.map((value) => (
          <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'd-chip d-chip-navy' : 'd-chip'} onClick={() => setCategory(value)}>
            {FILTER_LABEL[value]}
          </button>
        ))}
      </div>

      <div className="zma-row zma-between">
        <b className="d-lx">{g.nearYou}</b>
        {here ? <small className="d-muted">{g.sortedByDistance}</small> : (
          <button type="button" className="zma-link" onClick={() => void enableLocation()} disabled={locating}>{locating ? g.locating : g.enableLocation}</button>
        )}
      </div>

      {!data && !error ? (
        <ul className="zma-list" data-testid="market-loading" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <li key={i} className="zma-skel" />)}
        </ul>
      ) : !data && error ? (
        <div className="zma-center" data-testid="market-error">
          <BeVe pose="offline" size={120} />
          <p className="d-bubble">{g.marketErrorTitle}</p>
          <button type="button" className="d-btn d-btn-green" onClick={() => void load(here)}>{g.retry}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="zma-center" data-testid="market-empty">
          <BeVe pose="idle" size={130} />
          <b className="d-lx">{g.marketEmpty(category === 'ALL' ? '' : FILTER_LABEL[category].toLocaleLowerCase('vi'))}</b>
          <p className="d-muted">{g.marketEmptyBody}</p>
          <button type="button" className="d-pill" onClick={() => { setCategory('ALL'); setQ(''); }}>{g.seeAll}</button>
        </div>
      ) : (
        <ul data-testid="marketplace-branch-list" className="zma-list">
          {filtered.map((branch, i) => (
            <li key={branch.id}>
              <Link to={`/b/${branch.qrToken ?? branch.id}`} className={`d-card zma-mcard${stale ? ' zma-dim' : ''}`} data-testid={`market-${branch.id}`}>
                <span className={`zma-logo zma-tile ${TILE[i % TILE.length]}`} aria-hidden="true">{badge(branch.name)}</span>
                <div className="zma-mcard-body">
                  <p className="d-lx zma-mname">{branch.name}</p>
                  <small className="d-muted">
                    {[CATEGORY_LABEL[branch.category] ?? branch.category, branch.district, branch.distanceM != null ? formatDistance(branch.distanceM) : null].filter(Boolean).join(' · ')}
                  </small>
                  <div className="zma-row" style={{ gap: 6, marginTop: 6 }}>
                    <span className={branch.isPaused ? 'd-chip d-chip-yellow' : 'd-chip d-chip-green'}><i className="d-dot" />{branch.isPaused ? g.paused : g.open}</span>
                    {!branch.isPaused && branch.estimatedWaitMins != null ? <span className="d-chip">~{branch.estimatedWaitMins} {g.minutes}</span> : null}
                    {branch.isPaused ? <span className="d-chip">{g.comeBackLater}</span> : null}
                  </div>
                </div>
                <div className="zma-mcount">
                  <b className="d-num">{branch.waitingCount}</b>
                  <small className="d-muted">{g.groupsWaitingShort}</small>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {error && data && !stale ? <p className="zma-warn" role="alert">{g.marketErrorTitle}</p> : null}
      {error && stale ? <button type="button" className="d-btn d-btn-green" onClick={() => void load(here)}>{g.retry}</button> : null}
    </section>
  );
}
