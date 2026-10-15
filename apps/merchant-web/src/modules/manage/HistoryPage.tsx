import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { managerCopy as m } from '@luotdi/shared';
import { ManagerShell } from './ManagerRail';

const h = m.history;

export type HistResult = 'SEATED' | 'NO_SHOW' | 'CANCELLED' | 'ACTIVE';
export type HistRow = {
  id: string; displayNumber: string; customerName: string; phoneMasked: string | null; paxCount: number;
  bucketPrefix: string; source: 'COUNTER' | 'ZALO'; status: string; result: HistResult;
  createdAt: number; calledAt: number | null; heldAt: number | null; seatedAt: number | null; cancelledAt: number | null;
  waitedMins: number; zns: { sentAt: number; amountVnd: number } | null; canRestore: boolean; canRecall: boolean;
};
type HistResp = {
  date: string;
  counts: { all: number; seated: number; noShow: number; cancelled: number };
  stats: { issued: number; served: number; avgWaitMins: number; noShowPct: number };
  rows: HistRow[];
};

const RESULT_FILTERS = [
  { key: '', label: h.filterAll, count: 'all' },
  { key: 'seated', label: h.filterSeated, count: 'seated' },
  { key: 'noshow', label: h.filterNoShow, count: 'noShow' },
  { key: 'cancelled', label: h.filterCancelled, count: 'cancelled' },
] as const;

const RESULT_CHIP: Record<HistResult, [string, string]> = {
  SEATED: ['r4-sc r4-sc-g', h.resSeated],
  NO_SHOW: ['r4-sc r4-sc-h', h.resNoShow],
  CANCELLED: ['r4-sc r4-sc-m', h.resCancelled],
  ACTIVE: ['r4-sc r4-sc-y', h.resActive],
};

export function vnHhmm(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms + 7 * 3600_000).toISOString().slice(11, 16);
}
export function vnToday(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
function dateLabel(date: string, today: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][d.getUTCDay()];
  const dm = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return date === today ? `${h.today} · ${wd} ${dm}` : `${wd} ${dm}`;
}
const waitTint = (mins: number) => (mins >= 30 ? 'r4-sc r4-sc-h' : mins >= 25 ? 'r4-sc r4-sc-y' : 'r4-sc r4-sc-m');

export function HistoryPage() {
  const { branchId = '' } = useParams<{ branchId: string }>();
  const today = vnToday();
  const [date, setDate] = useState(today);
  const [result, setResult] = useState('');
  const [bucket, setBucket] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<HistResp | null>(null);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ date });
    if (result) p.set('result', result);
    if (bucket) p.set('bucket', bucket);
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [date, result, bucket, q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manage/${branchId}/history?${qs}`);
      if (!res.ok) throw new Error();
      setData((await res.json()) as HistResp);
      setError(null);
    } catch {
      setError(h.loadError);
    } finally {
      setLoading(false);
    }
  }, [branchId, qs]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    fetch(`/api/branches/${branchId}/snapshot`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { buckets?: { prefix: string }[] } | null) => setBuckets((s?.buckets ?? []).map((b) => b.prefix)))
      .catch(() => undefined);
  }, [branchId]);

  const row = data?.rows.find((r) => r.id === selected) ?? null;

  async function act(kind: 'recall' | 'restore', r: HistRow) {
    const res = await fetch(
      kind === 'recall' ? `/api/host/tickets/${r.id}/action` : `/api/manage/${branchId}/tickets/${r.id}/restore`,
      { method: kind === 'recall' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: kind === 'recall' ? JSON.stringify({ action: 'SUMMON' }) : '{}' },
    );
    if (res.ok) {
      setToast(kind === 'recall' ? h.toastRecalled(r.displayNumber) : h.toastRestored(r.displayNumber));
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { code?: string };
      setToast(j.code === 'ACTIVE_TICKET_EXISTS' ? h.restoreConflict : h.actionError);
    }
    setTimeout(() => setToast(null), 3500);
  }

  async function exportCsv() {
    const res = await fetch(`/api/manage/${branchId}/history?${qs}&format=csv`);
    if (!res.ok) { setToast(h.actionError); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich-su-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = !loading && !error && data && data.rows.length === 0 && !q && !result && !bucket;

  return (
    <ManagerShell
      page="manage-history"
      branchId={branchId}
      active="history"
      title={h.title}
      sub={h.sub}
      actions={
        <button type="button" className="d-pill" onClick={() => void exportCsv()}>{h.exportCsv}</button>
      }
    >
      <div className="r4-row r4-wrap">
        <input
          aria-label={h.dateLabel}
          type="date"
          className="r4-select"
          value={date}
          max={today}
          onChange={(e) => { setDate(e.target.value || today); setSelected(null); }}
          title={dateLabel(date, today)}
        />
        <div className="r4-seg" role="group" aria-label={h.resultLabel}>
          {RESULT_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={result === f.key} onClick={() => setResult(f.key)}>
              {f.label}{data ? <em>{data.counts[f.count]}</em> : null}
            </button>
          ))}
        </div>
        <div className="r4-seg" role="group" aria-label={h.bucketLabel}>
          <button type="button" aria-pressed={bucket === ''} onClick={() => setBucket('')}>{h.allBuckets}</button>
          {buckets.map((p) => (
            <button key={p} type="button" aria-pressed={bucket === p} onClick={() => setBucket(p)}>{p}</button>
          ))}
        </div>
        <span className="r4-sp" />
        <input className="r4-inp" style={{ width: 220 }} placeholder={m.search} aria-label={m.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error ? <p className="cc-error" role="alert">{error}</p> : null}

      {empty ? (
        <div className="r4-card r4-center" data-testid="history-empty">
          <BeVe pose="idle" size={150} />
          <b>{date === today ? h.emptyToday : h.emptyDay}</b>
          <p>{h.emptyBody}</p>
        </div>
      ) : (
        <>
          <div className="r4-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {data ? (
              <>
                <div className="r4-kpi"><b>{data.stats.issued} <small>{h.statIssued}</small></b></div>
                <div className="r4-kpi"><b>{data.stats.served} <small>{h.statServed}</small></b></div>
                <div className="r4-kpi"><b>{data.stats.avgWaitMins} phút <small>{h.statAvg}</small></b></div>
                <div className="r4-kpi"><b>{data.stats.noShowPct}% <small>{h.statNoShow}</small></b></div>
              </>
            ) : [0, 1, 2, 3].map((i) => <div key={i} className="r4-skel" style={{ height: 70 }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: row ? '1fr 340px' : '1fr', gap: 16, minHeight: 0 }}>
            <div className="r4-card" style={{ overflow: 'auto' }}>
              {loading && !data ? (
                <div data-testid="history-loading" style={{ display: 'grid', gap: 10 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="r4-skel" style={{ height: 34 }} />)}
                </div>
              ) : (
                <table className="r4-tbl">
                  <thead>
                    <tr>
                      {[m.colNumber, m.colGuest, m.colPax, m.colSource, h.colIssued, h.colCalled, h.colArrived, m.colWaited, h.colResult, h.colZns].map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((r) => (
                      <tr key={r.id} className="r4-click" aria-selected={r.id === selected} onClick={() => setSelected(r.id === selected ? null : r.id)}>
                        <td><span className="d-ticket" style={{ fontSize: 15 }}>{r.displayNumber}</span></td>
                        <td>{r.customerName}</td>
                        <td>{r.paxCount}</td>
                        <td><span className={r.source === 'ZALO' ? 'r4-sc r4-sc-n' : 'r4-sc r4-sc-m'}>{r.source === 'ZALO' ? m.sourceZalo : m.sourceCounter}</span></td>
                        <td>{vnHhmm(r.createdAt)}</td>
                        <td>{vnHhmm(r.calledAt)}</td>
                        <td>{vnHhmm(r.seatedAt)}</td>
                        <td><span className={waitTint(r.waitedMins)}>{r.waitedMins} phút</span></td>
                        <td><span className={RESULT_CHIP[r.result][0]}><i />{RESULT_CHIP[r.result][1]}</span></td>
                        <td>{r.zns ? <span className="r4-sc r4-sc-n">{h.znsSent}</span> : '—'}</td>
                      </tr>
                    ))}
                    {data && data.rows.length === 0 ? (
                      <tr><td colSpan={10} className="d-muted">{h.noMatch}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
            {row ? <Detail row={row} onClose={() => setSelected(null)} onAct={act} /> : null}
          </div>
        </>
      )}
      {toast ? <div className="cc-toast" role="status">{toast}</div> : null}
    </ManagerShell>
  );
}

function Detail({ row, onClose, onAct }: { row: HistRow; onClose: () => void; onAct: (k: 'recall' | 'restore', r: HistRow) => void }) {
  const steps: { t: string; s: string }[] = [
    { t: `${row.source === 'ZALO' ? h.tlIssuedZalo : h.tlIssuedCounter} · ${vnHhmm(row.createdAt)}`, s: row.source === 'ZALO' ? h.tlIssuedZaloSub : h.tlIssuedCounterSub },
  ];
  if (row.zns) steps.push({ t: `${h.tlZns} · ${vnHhmm(row.zns.sentAt)}`, s: h.tlZnsSub(row.zns.amountVnd) });
  if (row.calledAt) steps.push({ t: `${h.tlCalled} · ${vnHhmm(row.calledAt)}`, s: h.tlCalledSub });
  if (row.heldAt) steps.push({ t: `${h.tlHeld} · ${vnHhmm(row.heldAt)}`, s: '' });
  if (row.seatedAt) steps.push({ t: `${h.tlSeated} · ${vnHhmm(row.seatedAt)}`, s: row.calledAt ? h.tlSeatedSub(Math.round((row.seatedAt - row.calledAt) / 60_000)) : '' });
  if (row.cancelledAt) steps.push({ t: `${row.result === 'NO_SHOW' ? h.resNoShow : h.resCancelled} · ${vnHhmm(row.cancelledAt)}`, s: '' });
  const [cls, label] = RESULT_CHIP[row.result];
  return (
    <aside className="r4-drawer" data-testid="history-detail" aria-label={row.displayNumber}>
      <div className="r4-row" style={{ alignItems: 'flex-start' }}>
        <span className="d-ticket" style={{ fontSize: 26 }}>{row.displayNumber}</span>
        <div className="r4-sp">
          <b style={{ font: '700 18px var(--d-font-display)' }}>{row.customerName}</b>
          <div className="d-muted" style={{ fontSize: 13 }}>{[row.phoneMasked, `${row.paxCount} khách`, `Bàn ${row.bucketPrefix}`].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" className="r4-close" aria-label={m.close} onClick={onClose}>×</button>
      </div>
      <span className={cls} style={{ alignSelf: 'flex-start' }}><i />{label} · {h.waited(row.waitedMins)}</span>
      <span className="d-label">{h.timeline}</span>
      <ol className="r4-tl">
        {steps.map((st) => <li key={st.t}><i /><div><b>{st.t}</b>{st.s ? <small>{st.s}</small> : null}</div></li>)}
      </ol>
      <div className="r4-hint"><b>{h.ratingTitle}</b><p className="d-muted">{h.ratingNone}</p></div>
      <span className="r4-sp" />
      <div className="r4-row">
        <button type="button" className="d-pill" disabled={!row.canRecall} onClick={() => onAct('recall', row)}>{h.recall}</button>
        <button type="button" className="d-pill" disabled={!row.canRestore} onClick={() => onAct('restore', row)}>{h.restore}</button>
      </div>
    </aside>
  );
}
