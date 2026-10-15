/**
 * Client portfolio `/client` (M2) and branch setup `/client/branches/:branchId` (M3), Style D.
 * Buckets + the brand-shared ZNS wallet belong to the Client; ops toggles live in Manager · Cài đặt.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { clientCopy as c } from '@luotdi/shared';
import { BranchSetupView } from './BranchSetupView';
import { ClientRail } from './ClientRail';

export type PortfolioBranch = {
  id: string; name: string; address: string; district: string; tvSlug: string; waitingCount: number;
  servedToday: number; avgWaitMins: number | null; isPaused: boolean; queueStatus: string;
};
export type PortfolioBrand = {
  id: string; name: string; slug: string; industryType: string; planTier: string;
  walletBalanceVnd: number; walletMessages: number; walletLow: boolean; branches: PortfolioBranch[];
};
type Portfolio = {
  clientId: string; clientName: string;
  kpis: { waiting: number; servedToday: number; avgWaitMins: number | null; openBranches: number; totalBranches: number; pausedBranches: number };
  brands: PortfolioBrand[];
};

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const initials = (name: string) => {
  const digits = name.match(/\d+/)?.[0];
  const letters = name.replace(/\d+/g, '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase());
  return (digits ? `${letters[0] ?? ''}${digits}` : letters.slice(-2).join('')).slice(0, 3);
};
const LOGO_COLOURS = [['var(--d-navy)', 'var(--d-yellow)'], ['var(--d-green)', '#fff'], ['var(--d-hot)', '#fff']] as const;

function ClientPortfolioView() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/client/portfolio');
      if (!res.ok) throw new Error();
      setData((await res.json()) as Portfolio);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const needle = q.trim().toLocaleLowerCase('vi');
  const brands = useMemo(
    () => (data?.brands ?? [])
      .map((b) => ({ ...b, branches: needle ? b.branches.filter((br) => `${br.name} ${br.address}`.toLocaleLowerCase('vi').includes(needle)) : b.branches }))
      .filter((b) => !needle || b.branches.length > 0),
    [data, needle],
  );

  return (
    <div data-page="client-portfolio" className="d-root cc-app">
      <ClientRail />
      <div className="cc-main r4-main">
        <header className="cc-top">
          <div>
            <h1 className="r4-title" style={{ fontSize: 26 }}>{data?.clientName ?? c.portfolioTitle}</h1>
            {data ? <span className="d-muted" style={{ fontSize: 13 }}>{c.portfolioSub(data.brands.length, data.kpis.totalBranches)}</span> : null}
          </div>
          <span className="cc-sp" />
          <input className="r4-inp" style={{ width: 240 }} placeholder={c.searchBranch} aria-label={c.searchBranch} value={q} onChange={(e) => setQ(e.target.value)} />
          {data ? <span className="d-pill" title={c.accountSwitchHint}>{data.clientName}</span> : null}
        </header>

        {error ? (
          <div className="r4-card r4-center" style={{ minHeight: 280 }} data-testid="portfolio-error">
            <p className="cc-error" role="alert">{c.loadError}</p>
            <button type="button" className="d-pill" onClick={() => void load()}>{c.retry}</button>
          </div>
        ) : !data ? (
          <div data-testid="portfolio-loading" style={{ display: 'grid', gap: 14 }}>
            <div className="r4-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>{[0, 1, 2, 3].map((i) => <div key={i} className="r4-skel" style={{ height: 88 }} />)}</div>
            <div className="r4-skel" style={{ height: 200 }} />
            <p className="d-muted" style={{ textAlign: 'center' }}>{c.loading}</p>
          </div>
        ) : data.brands.length === 0 ? (
          <div className="r4-card r4-center" style={{ minHeight: 320 }} data-testid="portfolio-empty">
            <BeVe pose="idle" size={150} />
            <b>{c.emptyTitle}</b>
            <p>{c.emptyBody}</p>
          </div>
        ) : (
          <>
            <div className="r4-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }} data-testid="portfolio-kpis">
              <div className="r4-kpi"><span>{c.kWaiting}</span><b>{data.kpis.waiting} <small>{c.groups}</small></b></div>
              <div className="r4-kpi"><span>{c.kServed}</span><b>{data.kpis.servedToday}</b></div>
              <div className="r4-kpi"><span>{c.kAvg}</span><b>{data.kpis.avgWaitMins ?? '—'} <small>phút</small></b></div>
              <div className="r4-kpi">
                <span>{c.kOpen}</span><b>{data.kpis.openBranches}<small>/{data.kpis.totalBranches}</small></b>
                {data.kpis.pausedBranches ? <em className="r4-dn">{c.pausedCount(data.kpis.pausedBranches)}</em> : null}
              </div>
            </div>
            {brands.map((brand, i) => {
              const [bg, fg] = LOGO_COLOURS[i % LOGO_COLOURS.length]!;
              return (
                <section key={brand.id} className="r4-card" style={{ background: '#fbfaf3' }} data-testid={`portfolio-brand-${brand.id}`}>
                  <div className="r4-row" style={{ marginBottom: 12 }}>
                    <span className="r4-logo" style={{ background: bg, color: fg }} aria-hidden="true">{initials(brand.name)}</span>
                    <div>
                      <div className="r4-row" style={{ gap: 6 }}>
                        <h2 className="r4-title" style={{ fontSize: 18 }}>{brand.name}</h2>
                        <span className={brand.planTier === 'PRO' ? 'r4-plan r4-plan-pro' : 'r4-plan r4-plan-free'}>{brand.planTier}</span>
                      </div>
                      <span className="d-muted" style={{ fontSize: 13 }}>{c.industry[brand.industryType as keyof typeof c.industry] ?? brand.industryType} · {c.branchCount(brand.branches.length)}</span>
                    </div>
                    <span className="r4-sp" />
                    <span className={brand.walletLow ? 'r4-sc r4-sc-h' : 'r4-sc r4-sc-n'} data-testid={`wallet-chip-${brand.id}`}>{c.walletChip(vnd(brand.walletBalanceVnd))}</span>
                    <span className="d-muted" style={{ fontSize: 12.5 }}>≈ {brand.walletMessages} {c.msgs}</span>
                    {brand.branches[0] ? <Link className="d-pill r4-pill-sm" to={`/client/branches/${brand.branches[0].id}?tab=wallet`}>{c.topUp}</Link> : null}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {brand.branches.map((b) => (
                      <article key={b.id} className="r4-card" data-testid={`portfolio-branch-${b.id}`} style={{ padding: 14 }}>
                        <div className="r4-row" style={{ alignItems: 'flex-start' }}>
                          <div className="r4-sp">
                            <h3 style={{ margin: 0, font: '700 16px var(--d-font-display)' }}>{b.name}</h3>
                            <small className="d-muted">{b.address}{b.district ? `, ${b.district}` : ''}</small>
                          </div>
                          <span className={b.isPaused ? 'r4-sc r4-sc-y' : 'r4-sc r4-sc-g'}><i />{b.isPaused ? c.statusPaused : c.statusOpen}</span>
                        </div>
                        <div className="r4-row" style={{ margin: '10px 0', gap: 14, font: '500 13px var(--d-font-body)' }}>
                          <span><b style={{ font: '800 26px var(--d-font-display)', color: 'var(--d-navy)' }}>{b.waitingCount}</b> {c.waiting}</span>
                          <span><b style={{ font: '700 15px var(--d-font-display)' }}>{b.avgWaitMins == null ? '—' : `${b.avgWaitMins} phút`}</b> {c.avgShort}</span>
                          <span><b style={{ font: '700 15px var(--d-font-display)' }}>{b.servedToday}</b> {c.today}</span>
                        </div>
                        <div className="r4-row">
                          <Link className="d-pill d-pill-go r4-pill-sm" to={`/manage/${b.id}`}>{c.viewFloor}</Link>
                          <Link className="d-pill r4-pill-sm" to={`/client/branches/${b.id}`}>{c.setup}</Link>
                          <a className="d-pill r4-pill-sm" href={`/tv/${b.tvSlug}`} target="_blank" rel="noreferrer">TV</a>
                        </div>
                      </article>
                    ))}
                    <div className="r4-tile" aria-disabled="true" title={c.requestBranchHint}>
                      <b>+ {c.requestBranch}</b>{c.requestBranchSub}
                    </div>
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}


export function OwnerAdminPage() {
  const { branchId } = useParams<{ branchId?: string }>();
  return branchId ? <BranchSetupView branchId={branchId} /> : <ClientPortfolioView />;
}
