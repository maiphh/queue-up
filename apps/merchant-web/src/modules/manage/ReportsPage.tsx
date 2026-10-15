import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BeVe } from '@luotdi/design-d';
import { managerCopy as m } from '@luotdi/shared';
import { ManagerShell } from './ManagerRail';
import { vnHhmm, vnToday } from './HistoryPage';

const r = m.reports;

type RangeKey = 'today' | '7d' | '30d' | 'custom';
export type ReportResp = {
  range: { key: RangeKey; from: string; to: string; days: number };
  updatedAt: number;
  kpis: {
    issued: number; served: number; avgWaitMins: number; lostPct: number; znsSent: number; znsSpentVnd: number;
    deltas: { servedPct: number | null; avgWaitMins: number | null; lostPts: number | null };
  };
  byHour: { hour: number; avgPerDay: number }[];
  buckets: { prefix: string; label: string; served: number; avgWaitMins: number; noShowPct: number }[];
  source: { zaloPct: number; counterPct: number };
  suggestion: string | null;
};

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Delta line: "good" direction decides the colour (served up = good, wait/lost up = bad). */
function Delta({ v, unit, upGood }: { v: number | null; unit: string; upGood: boolean }) {
  if (v == null || v === 0) return <em className="d-muted">{v === 0 ? r.noChange : r.noCompare}</em>;
  const good = v > 0 === upGood;
  return <em className={good ? 'r4-up' : 'r4-dn'}>{v > 0 ? '▲' : '▼'} {Math.abs(v).toLocaleString('vi-VN')}{unit} {r.vsPrev}</em>;
}

export function ReportsPage() {
  const { branchId = '' } = useParams<{ branchId: string }>();
  const [range, setRange] = useState<RangeKey>('7d');
  const today = vnToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ range });
    if (range === 'custom') { p.set('from', from); p.set('to', to); }
    fetch(`/api/manage/${branchId}/reports?${p}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const j = (await res.json()) as ReportResp;
        if (live) { setData(j); setError(null); }
      })
      .catch(() => live && setError(r.loadError))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [branchId, range, from, to]);

  const sub = data ? (data.range.days === 1 ? `${r.today} · ${dm(data.range.from)}` : `${data.range.days} ${r.daysPast} · ${dm(data.range.from)} – ${dm(data.range.to)}`) : '';
  const max = Math.max(1, ...(data?.byHour.map((b) => b.avgPerDay) ?? [1]));
  const peaks = new Set(
    [...(data?.byHour ?? [])].sort((a, b) => b.avgPerDay - a.avgPerDay).slice(0, 3).filter((b) => b.avgPerDay > 0).map((b) => b.hour),
  );

  return (
    <ManagerShell page="manage-reports" branchId={branchId} active="reports" title={r.title} sub={sub}>
      <div className="r4-row r4-wrap">
        <div className="r4-seg" role="group" aria-label={r.rangeLabel}>
          {(['today', '7d', '30d', 'custom'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)}>{r.ranges[k]}</button>
          ))}
        </div>
        {range === 'custom' ? (
          <>
            <input type="date" className="r4-select" aria-label={r.from} value={from} max={to} onChange={(e) => setFrom(e.target.value || today)} />
            <input type="date" className="r4-select" aria-label={r.to} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || today)} />
          </>
        ) : null}
        <span className="d-muted" style={{ fontSize: 13 }}>{r.tz}{data ? ` · ${r.updated} ${vnHhmm(data.updatedAt)}` : ''}</span>
      </div>

      {error ? <p className="cc-error" role="alert">{error}</p> : null}

      {loading && !data ? (
        <div data-testid="reports-loading" style={{ display: 'grid', gap: 14 }}>
          <div className="r4-kpis">
            {[0, 1, 2, 3].map((i) => <div key={i} className="r4-skel" style={{ height: 92 }} />)}
          </div>
          <div className="r4-card r4-center" style={{ minHeight: 280 }}>
            <BeVe pose="excited" size={110} />
            <b>{r.loading}</b>
          </div>
        </div>
      ) : data && data.kpis.issued === 0 ? (
        <div className="r4-card r4-center" data-testid="reports-empty" style={{ minHeight: 320 }}>
          <BeVe pose="idle" size={150} />
          <b>{r.emptyTitle}</b>
          <p>{r.emptyBody}</p>
        </div>
      ) : data ? (
        <>
          <div className="r4-kpis">
            <div className="r4-kpi"><span>{r.kServed}</span><b>{data.kpis.served} <small>{r.groups}</small></b><Delta v={data.kpis.deltas.servedPct} unit="%" upGood /></div>
            <div className="r4-kpi"><span>{r.kWait}</span><b>{data.kpis.avgWaitMins} <small>phút</small></b><Delta v={data.kpis.deltas.avgWaitMins} unit=" phút" upGood={false} /></div>
            <div className="r4-kpi"><span>{r.kLost}</span><b>{data.kpis.lostPct.toLocaleString('vi-VN')}<small>%</small></b><Delta v={data.kpis.deltas.lostPts} unit={` ${r.pts}`} upGood={false} /></div>
            <div className="r4-kpi"><span>{r.kZns}</span><b>{data.kpis.znsSent} <small>{r.msgs}</small></b><em className="d-muted">{r.znsSpent(data.kpis.znsSpentVnd)}</em></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
            <div className="r4-card">
              <h3>{r.byHour}<small>{r.byHourSub}</small></h3>
              <div className="r4-bar" data-testid="reports-bars">
                {data.byHour.map((b) => (
                  <div key={b.hour}>
                    <b>{b.avgPerDay ? b.avgPerDay.toLocaleString('vi-VN') : ''}</b>
                    <i className={peaks.has(b.hour) ? 'r4-pk' : undefined} style={{ height: `${Math.max(2, (b.avgPerDay / max) * 85)}%` }} />
                    {b.hour}h
                  </div>
                ))}
              </div>
              {data.suggestion ? (
                <div className="r4-hint r4-row" style={{ marginTop: 14 }} data-testid="reports-suggestion">
                  <BeVe pose="excited" size={40} />
                  <p><b>{r.tip}:</b> {data.suggestion}</p>
                </div>
              ) : null}
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="r4-card">
                <h3>{r.byBucket}</h3>
                <table className="r4-tbl">
                  <thead><tr><th>{m.colTable}</th><th>{r.colGroup}</th><th>{r.colServed}</th><th>{r.colWait}</th><th>{r.colNoShow}</th></tr></thead>
                  <tbody>
                    {data.buckets.map((b) => (
                      <tr key={b.prefix}>
                        <td><span className="d-tk" style={{ minWidth: 40 }}>{b.prefix}</span></td>
                        <td>{b.label}</td>
                        <td><b>{b.served}</b></td>
                        <td><span className={b.avgWaitMins >= 25 ? 'r4-sc r4-sc-h' : b.avgWaitMins >= 15 ? 'r4-sc r4-sc-y' : 'r4-sc r4-sc-m'}>{b.avgWaitMins} phút</span></td>
                        <td>{b.noShowPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="r4-card">
                <h3>{r.source}</h3>
                <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', border: '2px solid var(--d-navy)' }} aria-hidden="true">
                  <span style={{ width: `${data.source.zaloPct}%`, background: 'var(--d-green)' }} />
                  <span style={{ flex: 1, background: 'var(--d-beige)' }} />
                </div>
                <div className="r4-row" style={{ marginTop: 10 }}>
                  <span className="r4-sc r4-sc-g"><i />{r.srcZalo} {data.source.zaloPct}%</span>
                  <span className="r4-sc r4-sc-m"><i />{m.sourceCounter} {data.source.counterPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </ManagerShell>
  );
}
