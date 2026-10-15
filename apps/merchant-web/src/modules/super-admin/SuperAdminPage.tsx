/** Platform Admin `/admin` (M1) — overview, filters, confirm-by-slug clear, and the onboarding wizard (M1b). */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { adminCopy as a } from '@luotdi/shared';
import { AdminRail } from './AdminRail';
import { OnboardWizard } from './OnboardWizard';

type Branch = { id: string; name: string; district: string; slug: string; waitingCount: number; isPaused: boolean };
type Brand = {
  id: string; name: string; slug: string; industryType: string; planTier: string; walletBalanceVnd: number; walletLow: boolean;
  monthlyTicketCount: number; monthlyQuota: number | null; branches: Branch[];
};
type Client = { id: string; name: string; brands: Brand[] };
type Attention = { kind: 'LOW_WALLET' | 'LONG_PAUSE' | 'SILENT'; brandId: string; branchId?: string; title: string; detail: string };
export type Overview = {
  kpis: { waitingTotal: number; ticketsToday: number; pausedBranches: number; lowWalletBrands: number; freeNearQuota: number; branches: number; brands: number; lowWalletFirst: { name: string; balanceVnd: number } | null; freeQuota: number };
  attention: Attention[];
  clients: Client[];
};
type StatusFilter = 'all' | 'open' | 'paused' | 'low';

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const initials = (name: string) => {
  const digits = name.match(/\d+/)?.[0];
  const letters = name.replace(/\d+/g, '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase());
  return (digits ? `${letters[0] ?? ''}${digits}` : letters.slice(0, 2).join('')).slice(0, 3);
};
const LOGO = [['var(--d-navy)', 'var(--d-yellow)'], ['var(--d-green)', '#fff'], ['#e8dcb8', 'var(--d-navy)']] as const;

export function SuperAdminPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const adding = params.get('view') === 'new';
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [industry, setIndustry] = useState('');
  const [clearing, setClearing] = useState<{ branch: Branch } | null>(null);
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error();
      setData((await res.json()) as Overview);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => { if (!adding) void load(); }, [load, adding]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3000); };

  async function changePlan(brand: Brand) {
    setActionError(null);
    try {
      const res = await fetch(`/api/super-admin/merchants/${brand.id}/plan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planTier: brand.planTier === 'PRO' ? 'FREE' : 'PRO' }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setActionError(a.planError);
    }
  }

  async function clearQueue() {
    if (!clearing) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/super-admin/branches/${clearing.branch.id}/force-clear`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { cancelledCount?: number };
      setClearing(null);
      flash(a.cleared(j.cancelledCount ?? 0));
      await load();
    } catch {
      setClearing(null);
      setActionError(a.clearError);
    }
  }

  const counts = useMemo(() => {
    const all = data?.clients.flatMap((c) => c.brands.flatMap((b) => b.branches.map((br) => ({ b, br })))) ?? [];
    return {
      all: all.length,
      open: all.filter((x) => !x.br.isPaused).length,
      paused: all.filter((x) => x.br.isPaused).length,
      low: all.filter((x) => x.b.walletLow).length,
    };
  }, [data]);

  const needle = q.trim().toLocaleLowerCase('vi');
  const matchBranch = (c: Client, b: Brand, br: Branch) =>
    (status === 'all' || (status === 'open' && !br.isPaused) || (status === 'paused' && br.isPaused) || (status === 'low' && b.walletLow)) &&
    (!industry || b.industryType === industry) &&
    (!needle || `${c.name} ${b.name} ${br.name} ${br.district}`.toLocaleLowerCase('vi').includes(needle));
  const filtered = (data?.clients ?? [])
    .map((c) => ({ ...c, brands: c.brands.map((b) => ({ ...b, branches: b.branches.filter((br) => matchBranch(c, b, br)) })).filter((b) => b.branches.length) }))
    .filter((c) => c.brands.length);
  const industries = [...new Set((data?.clients ?? []).flatMap((c) => c.brands.map((b) => b.industryType)))];

  const goAdd = () => setParams({ view: 'new' });
  const goList = () => setParams({});

  if (adding) {
    return (
      <div data-page="super-admin" className="d-root cc-app">
        <AdminRail active="add" onAdd={goAdd} onList={goList} />
        <OnboardWizard onCancel={goList} />
      </div>
    );
  }

  let brandIdx = -1;
  return (
    <div data-page="super-admin" className="d-root cc-app">
      <AdminRail active="clients" onAdd={goAdd} onList={goList} />
      <div className="cc-main r4-main" data-testid="super-admin-panel">
        <header className="cc-top">
          <div>
            <h1 className="r4-title" style={{ fontSize: 26 }}>{a.title}</h1>
            {data ? <span className="d-muted" style={{ fontSize: 13 }}>{a.sub(data.clients.length, data.kpis.brands, data.kpis.branches)}</span> : null}
          </div>
          <span className="cc-sp" />
          <input className="r4-inp" style={{ width: 260 }} placeholder={a.search} aria-label={a.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="d-btn d-btn-yellow" style={{ width: 'auto', padding: '0 20px', height: 46 }} onClick={goAdd}>+ {a.addClient}</button>
        </header>

        {actionError ? <p className="cc-error" role="alert">{actionError}</p> : null}

        {loadError ? (
          <div className="r4-card r4-center" style={{ minHeight: 260 }}>
            <p className="cc-error" role="alert">{a.loadError}</p>
            <button type="button" className="d-pill" onClick={() => void load()}>{a.retry}</button>
          </div>
        ) : !data ? (
          <div data-testid="admin-loading" style={{ display: 'grid', gap: 14 }}>
            <div className="r4-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="r4-skel" style={{ height: 88 }} />)}</div>
            {[0, 1, 2, 3].map((i) => <div key={i} className="r4-skel" style={{ height: 44 }} />)}
            <p className="d-muted" style={{ textAlign: 'center' }}>{a.loading}</p>
          </div>
        ) : data.clients.length === 0 ? (
          <div className="r4-card r4-center" style={{ minHeight: 320 }} data-testid="admin-empty">
            <BeVe pose="idle" size={150} />
            <b>{a.empty}</b>
            <p>{a.emptyBody}</p>
            <button type="button" className="d-btn d-btn-yellow" style={{ width: 'auto', padding: '0 20px' }} onClick={goAdd}>+ {a.addClient}</button>
          </div>
        ) : (
          <>
            <div className="r4-kpis" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }} data-testid="admin-kpis">
              <div className="r4-kpi"><span>{a.kWaiting}</span><b>{data.kpis.waitingTotal}</b></div>
              <div className="r4-kpi"><span>{a.kToday}</span><b>{data.kpis.ticketsToday}</b></div>
              <div className="r4-kpi"><span>{a.kPaused}</span><b>{data.kpis.pausedBranches}</b></div>
              <div className="r4-kpi">
                <span>{a.kLowWallet}</span><b className={data.kpis.lowWalletBrands ? 'r4-dn' : undefined}>{data.kpis.lowWalletBrands}</b>
                {data.kpis.lowWalletFirst ? <em className="r4-dn">{a.kLowWalletSub(data.kpis.lowWalletFirst.name, data.kpis.lowWalletFirst.balanceVnd)}</em> : null}
              </div>
              <div className="r4-kpi"><span>{a.kFree}</span><b>{data.kpis.freeNearQuota}</b><em className="d-muted">{a.kFreeSub(data.kpis.freeQuota)}</em></div>
            </div>
            <div className="r4-row r4-wrap">
              <div className="r4-seg" role="group" aria-label={a.colStatus}>
                {(['all', 'open', 'paused', 'low'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>
                    {{ all: a.fAll, open: a.fOpen, paused: a.fPaused, low: a.fLow }[k]}<em>{counts[k]}</em>
                  </button>
                ))}
              </div>
              <span className="r4-sp" />
              <div className="r4-seg" role="group" aria-label={a.industryLabel}>
                <button type="button" aria-pressed={industry === ''} onClick={() => setIndustry('')}>{a.allIndustries}</button>
                {industries.map((i) => <button key={i} type="button" aria-pressed={industry === i} onClick={() => setIndustry(i)}>{a.industry[i as keyof typeof a.industry] ?? i}</button>)}
              </div>
            </div>
            <div className="r4-card" style={{ overflow: 'auto' }} data-testid="client-list">
              <table className="r4-tbl">
                <thead>
                  <tr>{[a.colBrand, a.colBranch, a.colStatus, a.colWaiting, a.colPlan, a.colWallet, a.colMonth, ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? <tr><td colSpan={8} className="d-muted">{a.noMatch}</td></tr> : null}
                  {filtered.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="r4-group" data-testid={`client-${c.id}`}><td colSpan={8}>{a.groupHead(c.name, c.brands.reduce((n, b) => n + b.branches.length, 0))}</td></tr>
                      {c.brands.map((b) => {
                        brandIdx += 1;
                        const [bg, fg] = LOGO[brandIdx % LOGO.length]!;
                        return b.branches.map((br, i) => (
                          <tr key={br.id} data-testid={`branch-row-${br.id}`}>
                            <td>
                              {i === 0 ? (
                                <span className="r4-row" data-testid={`brand-${b.id}`} style={{ gap: 8 }}>
                                  <span className="r4-logo" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 11, background: bg, color: fg }} aria-hidden="true">{initials(b.name)}</span>
                                  <b>{b.name}</b>
                                </span>
                              ) : null}
                            </td>
                            <td>{br.name}<div className="d-muted" style={{ fontSize: 12 }}>{br.district}</div></td>
                            <td><span className={br.isPaused ? 'r4-sc r4-sc-y' : 'r4-sc r4-sc-g'}><i />{br.isPaused ? a.statusPaused : a.statusOpen}</span></td>
                            <td><b style={{ font: '800 18px var(--d-font-display)' }}>{br.waitingCount}</b></td>
                            <td>{i === 0 ? <span className={b.planTier === 'PRO' ? 'r4-plan r4-plan-pro' : 'r4-plan r4-plan-free'}>{b.planTier}</span> : null}</td>
                            <td>{i === 0 ? <span className={b.walletLow ? 'r4-sc r4-sc-h' : 'r4-sc r4-sc-m'}>{vnd(b.walletBalanceVnd)}{b.walletLow ? ` · ${a.low}` : ''}</span> : null}</td>
                            <td>{i === 0 ? (b.monthlyQuota ? `${b.monthlyTicketCount} / ${b.monthlyQuota}` : b.monthlyTicketCount) : null}</td>
                            <td>
                              <span className="r4-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                                <button type="button" className="d-pill r4-pill-sm" onClick={() => navigate(`/manage/${br.id}`)}>{a.openFloor}</button>
                                {i === 0 ? <button type="button" className="d-pill r4-pill-sm" onClick={() => void changePlan(b)}>{a.changePlan}</button> : null}
                                <button type="button" className="d-pill r4-pill-sm r4-pill-danger" onClick={() => { setTyped(''); setClearing({ branch: br }); }}>{a.clearQueue}</button>
                              </span>
                            </td>
                          </tr>
                        ));
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="r4-card" data-testid="admin-attention">
              <h3>{a.attention}<small>{a.attentionSub}</small></h3>
              {data.attention.length === 0 ? <p className="d-muted" style={{ margin: 0 }}>{a.attentionNone}</p> : data.attention.map((x, i) => (
                <div key={i} className="r4-setrow">
                  <span className={x.kind === 'LOW_WALLET' ? 'r4-sc r4-sc-h' : x.kind === 'LONG_PAUSE' ? 'r4-sc r4-sc-y' : 'r4-sc r4-sc-m'}><i />{a.attKind[x.kind]}</span>
                  <div className="r4-t"><b>{x.title}</b><small>{x.detail}</small></div>
                  <button
                    type="button"
                    className="d-pill r4-pill-sm"
                    onClick={() => {
                      const firstBranch = data.clients.flatMap((c) => c.brands).find((b) => b.id === x.brandId)?.branches[0]?.id;
                      if (x.kind === 'LONG_PAUSE' && x.branchId) navigate(`/manage/${x.branchId}`);
                      else if (x.kind === 'SILENT' && x.branchId) navigate(`/client/branches/${x.branchId}`);
                      else if (firstBranch) navigate(`/client/branches/${firstBranch}?tab=wallet`);
                    }}
                  >{a.attAction[x.kind]}</button>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      {clearing ? (
        <div className="r4-dlg" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="r4-dlg-box">
            <div className="r4-row" style={{ alignItems: 'flex-start' }}>
              <BeVe pose="late" size={64} />
              <div>
                <h3 id="clear-title" className="r4-title" style={{ fontSize: 20 }}>{a.confirmTitle(clearing.branch.name)}</h3>
                <p style={{ margin: '4px 0 0', font: '500 14px/1.45 var(--d-font-body)', color: 'var(--d-muted)' }}>{a.confirmBody(clearing.branch.waitingCount)}</p>
              </div>
            </div>
            <label className="r4-fl">
              <span>{a.confirmType(clearing.branch.slug)}</span>
              <input className="r4-inp r4-mono" aria-label={a.confirmType(clearing.branch.slug)} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </label>
            <div className="r4-row">
              <span className="r4-sp" />
              <button type="button" className="d-pill" onClick={() => setClearing(null)}>{a.close}</button>
              <button type="button" className="d-pill r4-pill-danger" disabled={typed.trim() !== clearing.branch.slug} onClick={() => void clearQueue()}>{a.confirmClear}</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="cc-toast" role="status">{toast}</div> : null}
    </div>
  );
}
