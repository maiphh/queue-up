import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BeVe, QrCode } from '@luotdi/design-d';
import { managerCopy as m } from '@luotdi/shared';
import { ManagerShell } from './ManagerRail';
import { vnHhmm } from './HistoryPage';

const c = m.qr;

type QrResp = { branchId: string; branchName: string; qrToken: string; walkInQrUrl: string; tvSlug: string; tvConnected: number; checkedAt: number };
type Template = 'a5' | 'a6' | 'a4';
const TEMPLATE_W: Record<Template, number> = { a5: 300, a6: 230, a4: 360 };

export function QrPage() {
  const { branchId = '' } = useParams<{ branchId: string }>();
  const [data, setData] = useState<QrResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tpl, setTpl] = useState<Template>('a5');
  const [steps, setSteps] = useState(true);
  const [bg, setBg] = useState<'green' | 'cream'>('green');
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/manage/${branchId}/qr`);
      if (!res.ok) throw new Error();
      setData((await res.json()) as QrResp);
      setError(null);
    } catch {
      setError(c.loadError);
    }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2500); };
  const tvUrl = data ? `${window.location.origin}/tv/${data.tvSlug}` : '';
  const tvShort = data ? `luotdi.vn/tv/${data.tvSlug}` : '';

  async function copy() {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.walkInQrUrl); flash(c.copied); } catch { flash(c.copyFail); }
  }

  function downloadPng() {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg || !data) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 1024;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);
      const a = document.createElement('a');
      a.download = `ma-qr-${data.tvSlug}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/manage/${branchId}/qr/regenerate`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setConfirm(false);
      flash(c.regenerated);
      await load();
    } catch {
      flash(c.regenerateFail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagerShell page="manage-qr" branchId={branchId} active="qr" title={c.title} sub={c.sub}>
      {error ? <p className="cc-error" role="alert">{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 18, alignItems: 'start' }}>
          <div className="r4-card" style={{ background: '#ecead9', display: 'grid', placeItems: 'center', padding: 30 }}>
            <div
              data-testid="qr-standee"
              className="r4-standee"
              style={{ width: TEMPLATE_W[tpl], background: '#fffdf4', borderRadius: 22, overflow: 'hidden', boxShadow: '0 14px 30px rgba(0,0,0,.12)' }}
            >
              <div style={{ background: bg === 'green' ? 'var(--d-green)' : 'var(--d-cream)', color: bg === 'green' ? '#fff' : 'var(--d-navy)', textAlign: 'center', padding: '18px 16px 70px' }}>
                <div style={{ font: '700 11px var(--d-font-display)', letterSpacing: '.18em', textTransform: 'uppercase' }}>{data.branchName}</div>
                <div style={{ font: `800 ${tpl === 'a6' ? 20 : 25}px/1.15 var(--d-font-display)`, marginTop: 6 }}>{c.headline}</div>
              </div>
              <div ref={qrRef} style={{ margin: '-58px auto 0', width: 'fit-content', background: '#fff', border: '4px solid var(--d-navy)', borderRadius: 22, padding: 12, boxShadow: '0 5px 0 var(--d-navy)' }}>
                <QrCode value={data.walkInQrUrl} size={tpl === 'a6' ? 130 : 150} label={c.qrAlt} />
              </div>
              {steps ? (
                <ol style={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '18px 12px 4px', margin: 0, textAlign: 'center', font: '600 11.5px/1.3 var(--d-font-body)' }}>
                  {c.steps.map((s, i) => (
                    <li key={s}>
                      <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 11, background: 'var(--d-yellow)', border: '2px solid var(--d-navy)', font: '800 11px var(--d-font-display)', marginBottom: 4 }}>{i + 1}</span>
                      <div>{s}</div>
                    </li>
                  ))}
                </ol>
              ) : null}
              <div className="r4-row" style={{ padding: '6px 14px 14px', alignItems: 'flex-end' }}>
                <BeVe pose="idle" size={46} />
                <span className="r4-sp" />
                <small style={{ font: '500 10px/1.35 var(--d-font-body)', color: 'var(--d-muted)', textAlign: 'right' }}>{c.footer1}<br />{c.footer2}</small>
              </div>
            </div>
          </div>

          <div className="r4-no-print" style={{ display: 'grid', gap: 14 }}>
            <div className="r4-card">
              <h3>{c.template}</h3>
              <div className="r4-seg" role="group" aria-label={c.template}>
                {(['a5', 'a6', 'a4'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={tpl === k} onClick={() => setTpl(k)}>{c.templates[k]}</button>
                ))}
              </div>
              <div className="r4-setrow">
                <div className="r4-t"><b>{c.stepsToggle}</b><small>{c.stepsHint}</small></div>
                <button type="button" className="d-toggle" role="switch" aria-checked={steps} aria-label={c.stepsToggle} onClick={() => setSteps(!steps)} />
              </div>
              <div className="r4-setrow">
                <div className="r4-t"><b>{c.bg}</b><small>{c.bgHint}</small></div>
                <button type="button" className="r4-swatch" style={{ background: 'var(--d-green)' }} aria-pressed={bg === 'green'} aria-label={c.bgGreen} onClick={() => setBg('green')} />
                <button type="button" className="r4-swatch" style={{ background: 'var(--d-cream)' }} aria-pressed={bg === 'cream'} aria-label={c.bgCream} onClick={() => setBg('cream')} />
              </div>
              <div className="r4-row">
                <button type="button" className="d-btn d-btn-yellow" style={{ flex: 1 }} onClick={() => window.print()}>{c.print} <kbd className="d-kbd">Ctrl P</kbd></button>
                <button type="button" className="d-pill" onClick={() => window.print()} title={c.pdfHint}>{c.pdf}</button>
                <button type="button" className="d-pill" onClick={downloadPng}>{c.png}</button>
              </div>
            </div>
            <div className="r4-card">
              <h3>{c.linkTitle}</h3>
              <div className="r4-row" style={{ border: '2px solid var(--d-line)', borderRadius: 14, padding: '6px 6px 6px 12px' }}>
                <span className="r4-mono r4-sp" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} data-testid="qr-link">{data.walkInQrUrl}</span>
                <button type="button" className="d-pill r4-pill-sm" onClick={() => void copy()}>{c.copy}</button>
              </div>
              <p className="d-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{c.linkHint}</p>
            </div>
            <div className="r4-card r4-row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div style={{ border: '2px solid var(--d-line)', borderRadius: 14, padding: 6 }}><QrCode value={tvUrl} size={84} label={c.tvQrAlt} /></div>
              <div className="r4-sp">
                <h3 style={{ marginBottom: 4 }}>{c.tvTitle}</h3>
                <p style={{ margin: '0 0 10px', font: '500 13.5px var(--d-font-body)' }}>{c.tvBody} <span className="r4-mono">{tvShort}</span></p>
                <div className="r4-row r4-wrap">
                  <span data-testid="qr-tv-chip" className={data.tvConnected > 0 ? 'r4-sc r4-sc-g' : 'r4-sc r4-sc-m'}><i />{c.tvConnected(data.tvConnected)} · {vnHhmm(data.checkedAt)}</span>
                  <a className="d-pill r4-pill-sm" href={`/tv/${data.tvSlug}`} target="_blank" rel="noreferrer">{c.openTv}</a>
                </div>
              </div>
            </div>
            <p style={{ margin: 0, font: '500 13px var(--d-font-body)', color: 'var(--d-hot)' }}>
              {c.regenWarn} <button type="button" className="r4-link-danger" onClick={() => setConfirm(true)}>{c.regen}</button>
            </p>
          </div>
        </div>
      ) : !error ? <div className="r4-skel" style={{ height: 480 }} /> : null}

      {confirm ? (
        <div className="r4-dlg" role="dialog" aria-modal="true" aria-labelledby="qr-regen-title">
          <div className="r4-dlg-box">
            <h3 id="qr-regen-title" className="r4-title">{c.regenTitle}</h3>
            <p style={{ margin: 0, font: '500 15px/1.45 var(--d-font-body)' }}>{c.regenBody}</p>
            <div className="r4-row">
              <span className="r4-sp" />
              <button type="button" className="d-btn-text" style={{ width: 'auto' }} onClick={() => setConfirm(false)}>{c.keep}</button>
              <button type="button" className="d-pill r4-pill-danger" disabled={busy} onClick={() => void regenerate()}>{c.regenConfirm}</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className="cc-toast" role="status">{toast}</div> : null}
    </ManagerShell>
  );
}
