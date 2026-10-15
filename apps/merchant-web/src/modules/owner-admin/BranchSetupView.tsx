import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { clientCopy as c } from '@luotdi/shared';
import { ClientRail } from './ClientRail';

export type SetupBucket = { id?: string; prefix: string; labelVi: string; minPax: number; maxPax: number; activeCounters: number; isActive: boolean; issued?: number };
type Ledger = { id: string; amountVnd: number; txType: string; createdAt: number; displayNumber: string | null; reference: string | null };
export type Setup = {
  branchId: string; branchName: string; address: string; district: string; routingMode: 'PARTY_SIZE' | 'SERVICE_TYPE';
  tvSlug: string; merchantName: string; merchantSlug: string; industryType: string; planTier: string;
  buckets: SetupBucket[];
  wallet: { balanceVnd: number; messages: number; daysLeft: number | null; low: boolean; sharedAcrossBrand: boolean };
  ledger: Ledger[];
  vietQr: { accountNumber: string; bankCode: string; bankName: string; accountName: string };
  vietQrMemo: string;
};
type Topup = { amountVnd: number; memo: string; bank: Setup['vietQr']; qrImageUrl: string; balanceVnd: number };

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const AMOUNTS = [50_000, 100_000, 200_000, 500_000];
const PREFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const D = '\u00B7';
function fmtTime(ms: number) {
  const d = new Date(ms + 7 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`;
}

/** Client-side mirror of the API's validateBuckets (PARTY_SIZE coverage: 1..max, no gaps/overlaps). */
export function checkCoverage(mode: string, list: SetupBucket[]): { fields: Record<string, string>; message: string | null; maxPax: number } {
  const fields: Record<string, string> = {};
  const active = list.filter((b) => b.isActive);
  if (mode === 'SERVICE_TYPE') {
    for (const b of list) if (!b.labelVi.trim()) fields[b.prefix] = c.errService;
    return { fields, message: active.length ? null : c.errNoActive, maxPax: 0 };
  }
  for (const b of list) if (b.minPax > b.maxPax) fields[b.prefix] = c.errRange;
  if (!active.length) return { fields, message: c.errNoActive, maxPax: 0 };
  const sorted = [...active].sort((a, b) => a.minPax - b.minPax);
  let next = 1;
  for (const b of sorted) {
    if (b.minPax > next) { fields[b.prefix] = c.errGapField; return { fields, message: c.errGap(next, b.minPax - 1), maxPax: 0 }; }
    if (b.minPax < next) { fields[b.prefix] = c.errOverlapField; return { fields, message: c.errOverlap(b.prefix), maxPax: 0 }; }
    next = b.maxPax + 1;
  }
  return { fields, message: null, maxPax: next - 1 };
}

function Step({ label, value, min, max, invalid, onChange }: { label: string; value: number; min: number; max: number; invalid?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="r4-fl" style={{ fontSize: 12, color: 'var(--d-muted)', fontWeight: 500 }}>
      {label}
      <span className="r4-step" aria-invalid={invalid}>
        <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }} />
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </span>
    </label>
  );
}

export function BranchSetupView({ branchId }: { branchId: string }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'wallet' ? 'wallet' : 'buckets';
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Setup['routingMode']>('PARTY_SIZE');
  const [buckets, setBuckets] = useState<SetupBucket[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [amount, setAmount] = useState(100_000);
  const [custom, setCustom] = useState('');
  const [topup, setTopup] = useState<Topup | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const apply = (s: Setup) => {
    setSetup(s);
    setMode(s.routingMode);
    setBuckets(s.buckets.map((b) => ({ ...b })));
  };
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/branches/${branchId}`);
      if (!res.ok) throw new Error();
      apply((await res.json()) as Setup);
    } catch {
      setLoadError(true);
    }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);

  // While a transfer is pending, poll the wallet until the SePay webhook credits it.
  useEffect(() => {
    if (!topup || paid) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/client/branches/${branchId}`).catch(() => null);
      if (!res?.ok) return;
      const s = (await res.json()) as Setup;
      if (s.wallet.balanceVnd > topup.balanceVnd) {
        setPaid(true);
        setSetup(s);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [branchId, topup, paid]);

  const cov = useMemo(() => checkCoverage(mode, buckets), [mode, buckets]);
  const dirty = setup ? JSON.stringify({ mode, buckets }) !== JSON.stringify({ mode: setup.routingMode, buckets: setup.buckets }) : false;
  const next = PREFIXES.find((p) => !buckets.some((b) => b.prefix === p));
  const patch = (i: number, p: Partial<SetupBucket>) => { setSaved(false); setSaveError(null); setBuckets((bs) => bs.map((b, j) => (j === i ? { ...b, ...p } : b))); };
  const preview = mode === 'PARTY_SIZE' ? buckets.find((b) => b.isActive && b.minPax !== b.maxPax) ?? buckets.find((b) => b.isActive) : buckets.find((b) => b.isActive);

  async function save() {
    if (Object.keys(cov.fields).length || cov.message) { setSaveError(c.saveError); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/client/branches/${branchId}/buckets`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingMode: mode, buckets: buckets.map(({ issued: _i, ...b }) => b) }),
      });
      if (!res.ok) throw new Error();
      apply((await res.json()) as Setup);
      setSaved(true);
      setSaveError(null);
    } catch {
      setSaveError(c.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function createTransfer() {
    const amt = custom ? Number.parseInt(custom.replace(/\D/g, ''), 10) : amount;
    setTopupError(null);
    const res = await fetch(`/api/client/branches/${branchId}/topup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountVnd: amt }),
    }).catch(() => null);
    if (!res?.ok) { setTopupError(c.amountError); return; }
    setPaid(false);
    setTopup((await res.json()) as Topup);
  }

  if (loadError) return <div className="d-root cc-app"><ClientRail /><div className="cc-main"><p className="cc-error" role="alert">{c.setupLoadError}</p></div></div>;

  const walletCard = setup ? (
    <section className="r4-card" data-testid="vietqr-topup">
      <h3>{c.walletTitle}<small>{c.walletShared(setup.merchantName)}</small></h3>
      <div className="r4-row" style={{ marginBottom: 10 }}>
        <b style={{ font: '800 34px var(--d-font-display)', color: 'var(--d-navy)' }}>{vnd(setup.wallet.balanceVnd)}</b>
        <span className="r4-sc r4-sc-n">≈ {setup.wallet.messages} {c.msgs}</span>
        <span className="r4-sp" />
        <span className={setup.wallet.low ? 'r4-sc r4-sc-h' : 'r4-sc r4-sc-g'}><i />{setup.wallet.low ? c.walletLow : setup.wallet.daysLeft == null ? c.walletOk : c.walletDays(setup.wallet.daysLeft)}</span>
      </div>
      <div className="r4-seg" role="group" aria-label={c.amount} style={{ border: 0, padding: 0, gap: 8 }}>
        {AMOUNTS.map((a) => <button key={a} type="button" aria-pressed={!custom && amount === a} onClick={() => { setAmount(a); setCustom(''); }} style={{ border: '2px solid var(--d-line)' }}>{vnd(a)}</button>)}
        <input className="r4-inp" style={{ width: 120, height: 38 }} placeholder={c.other} aria-label={c.other} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </div>
      {topupError ? <p className="cc-error" role="alert">{topupError}</p> : null}
      {topup ? (
        <div className="r4-row" style={{ alignItems: 'flex-start', marginTop: 12, gap: 14 }} data-testid="vietqr-pending">
          <img src={topup.qrImageUrl} alt={c.qrAlt} width={130} height={130} style={{ border: '2.5px solid var(--d-navy)', borderRadius: 16, padding: 6, background: '#fff' }} />
          <div style={{ display: 'grid', gap: 6, font: '500 14px var(--d-font-body)' }}>
            <span className={paid ? 'r4-sc r4-sc-g' : 'r4-sc r4-sc-y'} role="status"><i />{paid ? c.paid : c.pending}</span>
            <span>{c.bank} <b>{topup.bank.bankName}</b> <span className="r4-mono">{topup.bank.accountNumber}</span></span>
            <span>{c.amountLabel} <b>{vnd(topup.amountVnd)}</b></span>
            <span>{c.memo} <span className="r4-mono" style={{ background: 'var(--d-yellow-soft)', padding: '2px 6px', borderRadius: 6 }}>{topup.memo}</span></span>
            <small className="d-muted">{c.memoHint}</small>
          </div>
        </div>
      ) : (
        <button type="button" className="d-pill d-pill-go" style={{ marginTop: 12 }} onClick={() => void createTransfer()}>{c.createTransfer}</button>
      )}
    </section>
  ) : null;

  const ledgerCard = setup ? (
    <section className="r4-card">
      <h3>{c.ledger}</h3>
      {setup.ledger.length === 0 ? <p className="d-muted">{c.ledgerEmpty}</p> : (
        <table className="r4-tbl">
          <tbody>
            {setup.ledger.map((l) => (
              <tr key={l.id}>
                <td>{fmtTime(l.createdAt)}</td>
                <td>{l.txType === 'TOPUP_VIETQR' ? `${c.txTopup} · ${setup.vietQrMemo}` : l.displayNumber ? c.txZns(l.displayNumber) : l.txType}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: l.amountVnd > 0 ? 'var(--d-green-deep)' : undefined }}>{l.amountVnd > 0 ? '+' : '−'}{vnd(Math.abs(l.amountVnd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  ) : null;

  return (
    <div data-page="client-branch" className="d-root cc-app">
      <ClientRail />
      <div className="cc-main r4-main">
        <header className="cc-top">
          <div>
            <h1 className="r4-title" style={{ fontSize: 26 }}>{setup?.branchName ?? '…'}</h1>
            {setup ? <span className="d-muted" style={{ fontSize: 13 }}>{setup.merchantName} · {c.setupSub} · {setup.address}{setup.district ? `, ${setup.district}` : ''}</span> : null}
          </div>
          <span className="cc-sp" />
          <Link className="d-pill" to={`/manage/${branchId}`}>{c.viewFloor}</Link>
          {setup ? <a className="d-pill" href={`/tv/${setup.tvSlug}`} target="_blank" rel="noreferrer">{c.openTv}</a> : null}
        </header>
        <div className="r4-seg" role="tablist" aria-label={c.setup} style={{ alignSelf: 'flex-start' }}>
          <button type="button" role="tab" aria-selected={tab === 'buckets'} aria-pressed={tab === 'buckets'} onClick={() => setParams({})}>{c.tabBuckets}</button>
          <button type="button" role="tab" aria-selected={tab === 'wallet'} aria-pressed={tab === 'wallet'} onClick={() => setParams({ tab: 'wallet' })}>{c.tabWallet}</button>
          <Link role="tab" className="r4-seg-link" to={`/manage/${branchId}/qr`} style={{ height: 34, padding: '0 14px', display: 'inline-flex', alignItems: 'center', font: '700 14px var(--d-font-display)', color: '#555', textDecoration: 'none' }}>{c.tabQr}</Link>
          <button type="button" role="tab" aria-disabled="true" title={c.soon} style={{ opacity: 0.5, cursor: 'not-allowed' }}>{c.tabStaff}</button>
        </div>

        {!setup ? <div className="r4-skel" style={{ height: 420 }} /> : tab === 'wallet' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>{walletCard}{ledgerCard}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(340px, 1fr)', gap: 16, alignItems: 'start' }}>
            <section className="r4-card" data-testid="bucket-editor" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3>{mode === 'PARTY_SIZE' ? c.bucketsByPax : c.bucketsByService}<small>{mode === 'PARTY_SIZE' ? c.bucketsByPaxSub : c.bucketsByServiceSub}</small></h3>
              <div className="r4-row">
                <div className="r4-seg" role="group" aria-label={c.routing}>
                  <button type="button" aria-pressed={mode === 'PARTY_SIZE'} onClick={() => { setMode('PARTY_SIZE'); setSaved(false); }}>{c.byPax}</button>
                  <button type="button" aria-pressed={mode === 'SERVICE_TYPE'} onClick={() => { setMode('SERVICE_TYPE'); setSaved(false); }}>{c.byService}</button>
                </div>
                <span className="d-muted" style={{ fontSize: 12.5 }}>{c.clinicHint}</span>
              </div>
              {buckets.map((b, i) => (
                <div key={b.prefix} className="r4-setrow" data-testid={`bucket-row-${b.prefix}`} style={{ flexWrap: 'wrap', gap: 12, opacity: b.isActive ? 1 : 0.55 }}>
                  <span className="d-ticket" style={{ fontSize: 22, minWidth: 44, textAlign: 'center' }}>{b.prefix}</span>
                  <div style={{ minWidth: 110 }}>
                    <b style={{ font: '700 15px var(--d-font-display)' }}>{c.bucketName(b.prefix)}</b>
                    <div className="d-muted" style={{ fontSize: 12.5 }}>{c.firstNumber} {b.prefix}{D}{String((b.issued ?? 0) + 1).padStart(3, '0')}</div>
                  </div>
                  {mode === 'PARTY_SIZE' ? (
                    <>
                      <Step label={c.minPax} value={b.minPax} min={1} max={50} invalid={!!cov.fields[b.prefix]} onChange={(v) => patch(i, { minPax: v })} />
                      <Step label={c.maxPax} value={b.maxPax} min={1} max={50} invalid={!!cov.fields[b.prefix]} onChange={(v) => patch(i, { maxPax: v })} />
                    </>
                  ) : (
                    <label className="r4-fl r4-sp" style={{ fontSize: 12, color: 'var(--d-muted)', fontWeight: 500 }}>
                      {c.serviceName}
                      <input className="r4-inp" aria-label={c.serviceName} aria-invalid={!!cov.fields[b.prefix]} placeholder={c.servicePlaceholder} value={b.labelVi} onChange={(e) => patch(i, { labelVi: e.target.value })} />
                    </label>
                  )}
                  <Step label={c.counters} value={b.activeCounters} min={1} max={20} onChange={(v) => patch(i, { activeCounters: v })} />
                  <button type="button" className="d-toggle" role="switch" aria-checked={b.isActive} aria-label={c.bucketActive(b.prefix)} onClick={() => patch(i, { isActive: !b.isActive })} />
                </div>
              ))}
              <div className="r4-row" style={{ marginTop: 8 }}>
                {next ? (
                  <button type="button" className="d-pill" onClick={() => {
                    const max = Math.max(0, ...buckets.filter((b) => b.isActive).map((b) => b.maxPax));
                    setSaved(false);
                    setBuckets((bs) => [...bs, { prefix: next, labelVi: '', minPax: max + 1, maxPax: max + 2, activeCounters: 1, isActive: true, issued: 0 }]);
                  }}>+ {c.addBucket} {next}</button>
                ) : null}
                <span className="r4-sp" />
                <span data-testid="coverage" className={cov.message ? 'r4-em' : 'd-muted'} style={{ fontSize: 13 }}>
                  {cov.message ?? (mode === 'PARTY_SIZE' ? c.coverageOk(cov.maxPax) : c.coverageService(buckets.filter((b) => b.isActive).length))}
                </span>
                <button type="button" className="d-pill d-pill-go" disabled={saving || (!dirty && !saveError)} onClick={() => void save()}>{c.save}</button>
              </div>
              {saveError ? <p className="cc-error" role="alert">{saveError}</p> : null}
              {saved ? <p className="d-muted" role="status" style={{ margin: 0 }}>{c.saved}</p> : null}
              {preview ? (
                <div className="r4-hint r4-row" style={{ marginTop: 12 }}>
                  <BeVe pose="idle" size={38} />
                  <p>{mode === 'PARTY_SIZE' ? c.previewPax(preview.minPax, preview.maxPax, `${preview.prefix}${D}${String((preview.issued ?? 0) + 1).padStart(3, '0')}`) : c.previewService(preview.labelVi || c.servicePlaceholder, `${preview.prefix}${D}${String((preview.issued ?? 0) + 1).padStart(3, '0')}`)}</p>
                </div>
              ) : null}
            </section>
            <div style={{ display: 'grid', gap: 16 }}>{walletCard}{ledgerCard}</div>
          </div>
        )}
      </div>
    </div>
  );
}
