/**
 * Manager floor — Call Console (Style D "Tươi & Nổi", round 3 Layout A).
 * `/manage/:branchId` (and `/host/:branchId` via redirect).
 *
 * Primary: Đang mời + big GỌI SỐ TIẾP (Space). Secondary: called-not-arrived
 * list, waiting table with Bàn tabs + wait colours. Tertiary: stats strip.
 * Bé Vé appears ONLY in the empty state, the call toast, and the paused banner.
 * Shortcuts: Space call next · ↵ đã đến · H giữ chỗ · Z hoàn tác · N khách đến quầy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { managerCopy as m } from '@luotdi/shared';
import { BeVe, callPress, mascotPop, numberFlip, rowCollapse, toastIn } from '@luotdi/design-d';
import './call-console.css';
import { DEV_ACTOR_STORAGE_KEY, readDevActor } from '../../dev/actor';
import { useQueueSocket } from '../../hooks/useQueueSocket';

type HostTicketStatus = 'WAITING' | 'CALLED' | 'HELD' | 'SEATED' | 'CANCELLED';

type HostTicket = {
  id: string;
  displayNumber: string;
  status: HostTicketStatus;
  bucketId: string;
  paxCount: number;
  customerName: string;
  priorityBoost: number;
  createdAt: number;
  calledAt: number | null;
  heldAt?: number | null;
  source?: string;
};

type SnapshotBucket = { id: string; prefix: string; labelVi?: string; minPax: number; maxPax: number };

type HostSnapshot = {
  branchId: string;
  branchName: string;
  waitingCount: number;
  avgWaitMins: number;
  queueStatus: 'OPEN' | 'PAUSED' | 'CLOSED' | string;
  isPaused: boolean;
  tickets: HostTicket[];
  industryType?: string;
  buckets?: SnapshotBucket[];
  graceMins?: number;
  stats?: { servedToday: number; cancelledToday: number; walletBalanceVnd: number };
};

/** Deferred SUMMON so "Hoàn tác" is a real undo (nothing has been sent yet). */
export const UNDO_WINDOW_MS = 4000;
const POLL_MS = 15_000;

const ACTION_ERROR = 'Không thực hiện được thao tác.';
const LOAD_ERROR = 'Không tải được hàng chờ.';
const WALK_IN_ERROR = 'Không tạo được số.';

function showAdminViewBanner(): boolean {
  if (sessionStorage.getItem(DEV_ACTOR_STORAGE_KEY) == null) return false;
  return readDevActor().role === 'PLATFORM_ADMIN';
}

const prefixOf = (t: HostTicket) => t.displayNumber.charAt(0);
const minsSince = (ts: number, now: number) => Math.max(0, Math.floor((now - ts) / 60_000));
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** Wait colour: ≥16′ hot, ≥12′ warm (round-3 admin board). */
export function waitTone(mins: number): 'h' | 'm' | 'n' {
  return mins >= 16 ? 'h' : mins >= 12 ? 'm' : 'n';
}
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

type Pending = { ticket: HostTicket; at: number; timer: ReturnType<typeof setTimeout> };

export function HostPosPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPax, setWalkInPax] = useState(2);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [drawerTicketId, setDrawerTicketId] = useState<string | null>(null);
  const [adminBanner] = useState(() => showAdminViewBanner());
  const [tab, setTab] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const callBtnRef = useRef<HTMLButtonElement>(null);
  const servingNumRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const emptyMascotRef = useRef<HTMLDivElement>(null);
  const pausedMascotRef = useRef<HTMLDivElement>(null);

  const loadSnapshot = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await fetch(`/api/branches/${branchId}/snapshot`);
      if (!res.ok) {
        setError(LOAD_ERROR);
        return;
      }
      setSnapshot((await res.json()) as HostSnapshot);
      setError(null);
    } catch {
      setError(LOAD_ERROR);
    }
  }, [branchId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const { connected } = useQueueSocket({ branchId, role: 'HOST', onEvent: () => void loadSnapshot() });
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => void loadSnapshot(), POLL_MS);
    return () => clearInterval(t);
  }, [connected, loadSnapshot]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const postTicketAction = useCallback(
    async (ticketId: string, action: string, extra: Record<string, unknown> = {}) => {
      setActionError(null);
      try {
        const res = await fetch(`/api/host/tickets/${ticketId}/action`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Test-Staff-Role': 'BRANCH_HOST' },
          body: JSON.stringify({ action, ...extra }),
        });
        if (!res.ok) {
          setActionError(ACTION_ERROR);
          return false;
        }
        setDrawerTicketId(null);
        await loadSnapshot();
        return true;
      } catch {
        setActionError(ACTION_ERROR);
        return false;
      }
    },
    [loadSnapshot],
  );

  // ── Derived lists (pending call is shown optimistically) ─────────────
  const tickets = useMemo(() => {
    const list = snapshot?.tickets ?? [];
    if (!pending) return list;
    return list.map((t) => (t.id === pending.ticket.id ? { ...t, status: 'CALLED' as const, calledAt: pending.at } : t));
  }, [snapshot, pending]);

  const waiting = useMemo(() => tickets.filter((t) => t.status === 'WAITING'), [tickets]);
  const held = useMemo(() => tickets.filter((t) => t.status === 'HELD'), [tickets]);
  const called = useMemo(
    () => tickets.filter((t) => t.status === 'CALLED').sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0)),
    [tickets],
  );
  const serving = pending ? called.find((t) => t.id === pending.ticket.id) ?? called[0] : called[0];
  const calledNotArrived = useMemo(
    () => [...called.filter((t) => t.id !== serving?.id), ...held],
    [called, held, serving],
  );
  const nextUp = waiting[0];

  const buckets: SnapshotBucket[] = useMemo(() => {
    if (snapshot?.buckets?.length) return snapshot.buckets;
    const seen = new Map<string, SnapshotBucket>();
    for (const t of snapshot?.tickets ?? []) {
      const p = prefixOf(t);
      if (!seen.has(p)) seen.set(p, { id: t.bucketId, prefix: p, minPax: 0, maxPax: 0 });
    }
    return [...seen.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
  }, [snapshot]);

  const rows = useMemo(() => {
    const base = tab === 'HELD' ? held : tab === 'ALL' ? waiting : waiting.filter((t) => t.bucketId === tab || prefixOf(t) === tab);
    const q = query.trim().toLowerCase();
    return q ? base.filter((t) => t.customerName.toLowerCase().includes(q) || t.displayNumber.toLowerCase().includes(q)) : base;
  }, [tab, held, waiting, query]);

  const isClinic = snapshot?.industryType === 'CLINIC' || snapshot?.industryType === 'HOSPITAL';
  const changeLabel = isClinic ? m.changeService : m.changeParty;
  const guestNoun = isClinic ? m.patientNoun : m.guestNoun;
  const isPaused = Boolean(snapshot && (snapshot.isPaused || snapshot.queueStatus === 'PAUSED'));
  const grace = (snapshot?.graceMins ?? 3) * 60_000;
  const tableOf = (t: HostTicket) => `Bàn ${prefixOf(t)}`;
  const sourceLabel = (t: HostTicket) => (t.source === 'HOST_MANUAL' ? m.sourceCounter : m.sourceZalo);

  // ── Call next with undo window ───────────────────────────────────────
  const commitPending = useCallback(
    (p: Pending | null) => {
      if (!p) return;
      clearTimeout(p.timer);
      setPending(null);
      void postTicketAction(p.ticket.id, 'SUMMON');
    },
    [postTicketAction],
  );

  const callTicket = useCallback(
    async (t: HostTicket | undefined) => {
      if (!t || isPaused) {
        if (!t) setActionError(m.nothingToCall);
        return;
      }
      commitPending(pendingRef.current); // one pending call at a time
      callPress(callBtnRef.current);
      const row = document.querySelector(`[data-testid="waiting-row-${t.id}"]`);
      const anim = rowCollapse(row);
      if (anim?.finished) await anim.finished.catch(() => undefined);
      const timer = setTimeout(() => {
        if (pendingRef.current?.ticket.id === t.id) commitPending(pendingRef.current);
      }, UNDO_WINDOW_MS);
      setPending({ ticket: t, at: Date.now(), timer });
    },
    [isPaused, commitPending],
  );

  const undo = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    setPending(null);
  }, []);

  // Commit (not drop) a pending call if the page unmounts.
  useEffect(() => () => commitPending(pendingRef.current), [commitPending]);

  // Motion: number flip when Đang mời changes; toast in; mascots pop once.
  const servingId = serving?.id;
  useEffect(() => {
    if (servingId) numberFlip(servingNumRef.current);
  }, [servingId]);
  useEffect(() => {
    if (pending) {
      toastIn(toastRef.current);
      mascotPop(toastRef.current?.querySelector('.be-ve'));
    }
  }, [pending]);
  const empty = waiting.length === 0 && held.length === 0 && called.length === 0;
  useEffect(() => {
    if (empty) mascotPop(emptyMascotRef.current);
  }, [empty]);
  useEffect(() => {
    if (isPaused) mascotPop(pausedMascotRef.current);
  }, [isPaused]);

  const seatServing = useCallback(() => {
    if (!serving) return;
    if (pendingRef.current?.ticket.id === serving.id) commitPending(pendingRef.current);
    void postTicketAction(serving.id, 'SEAT');
  }, [serving, commitPending, postTicketAction]);

  const holdServing = useCallback(() => {
    if (!serving) return;
    if (pendingRef.current?.ticket.id === serving.id) commitPending(pendingRef.current);
    void postTicketAction(serving.id, 'HOLD');
  }, [serving, commitPending, postTicketAction]);

  const pauseQueue = useCallback(async () => {
    if (!branchId) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/branches/${branchId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !isPaused }),
      });
      if (!res.ok) {
        setActionError(ACTION_ERROR);
        return;
      }
      await loadSnapshot();
    } catch {
      setActionError(ACTION_ERROR);
    }
  }, [branchId, isPaused, loadSnapshot]);

  // ── Keyboard shortcuts (one listener; reads the latest handlers via a ref) ──
  const keyState = useRef({ walkInOpen, drawerTicketId, callTicket, nextUp, seatServing, holdServing, undo });
  keyState.current = { walkInOpen, drawerTicketId, callTicket, nextUp, seatServing, holdServing, undo };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const st = keyState.current;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || st.walkInOpen || st.drawerTicketId) return;
      const k = e.key;
      if (k === ' ' || e.code === 'Space') {
        e.preventDefault();
        void st.callTicket(st.nextUp);
      } else if (k === 'Enter') {
        if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return; // let focused buttons work
        e.preventDefault();
        st.seatServing();
      } else if (k === 'h' || k === 'H') {
        e.preventDefault();
        st.holdServing();
      } else if (k === 'z' || k === 'Z') {
        e.preventDefault();
        st.undo();
      } else if (k === 'n' || k === 'N') {
        e.preventDefault();
        setActionError(null);
        setWalkInOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitWalkIn = useCallback(async () => {
    if (!branchId) return;
    const customerName = walkInName.trim();
    if (!customerName) {
      setActionError(WALK_IN_ERROR);
      return;
    }
    setWalkInSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, customerName, paxCount: walkInPax, source: 'HOST_MANUAL' }),
      });
      if (!res.ok) {
        setActionError(WALK_IN_ERROR);
        return;
      }
      setWalkInOpen(false);
      setWalkInName('');
      setWalkInPax(2);
      await loadSnapshot();
    } catch {
      setActionError(WALK_IN_ERROR);
    } finally {
      setWalkInSubmitting(false);
    }
  }, [branchId, walkInName, walkInPax, loadSnapshot]);

  const drawerTicket = useMemo(() => tickets.find((t) => t.id === drawerTicketId) ?? null, [tickets, drawerTicketId]);

  if (!branchId) return <div className="cc-msg">Thiếu chi nhánh.</div>;
  if (error && !snapshot) return <div className="cc-msg">{error}</div>;
  if (!snapshot) return <div className="cc-msg">Đang tải.</div>;

  const dateLabel = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(now));

  return (
    <div data-page="host-pos" className="d-root cc-app">
      <nav className="cc-rail" aria-label="Điều hướng">
        <span className="cc-logo">L</span>
        <span className="cc-nav cc-nav-on" aria-current="page"><i />{m.nav.counter}</span>
        <Link className="cc-nav" to={`/tv/branch/${branchId}`}><i />{m.nav.tv}</Link>
      </nav>

      <div className="cc-main">
        {adminBanner ? <p data-testid="admin-view-banner" className="cc-admin">{m.adminViewBanner}</p> : null}

        <header data-testid="host-pos-top-bar" className="cc-top">
          <div className="cc-branch">
            <small>Chi nhánh</small>
            <h1>{snapshot.branchName}</h1>
          </div>
          <span className="d-muted cc-date">{m.eyebrow} · {dateLabel}</span>
          <span className="cc-sp" />
          <span className={isPaused ? 'd-pill' : 'd-pill d-pill-green'} role="status">
            <i className="cc-dot" />
            {isPaused ? m.statusPaused : m.statusOpen}
          </span>
          <button type="button" className={isPaused ? 'd-pill d-pill-go' : 'd-pill'} onClick={() => void pauseQueue()}>
            {isPaused ? m.resume : m.pause}
          </button>
          <button type="button" className="d-pill" onClick={() => { setActionError(null); setWalkInOpen(true); }}>
            + {m.walkIn} <kbd className="d-kbd">N</kbd>
          </button>
        </header>

        {actionError ? <p data-testid="host-pos-action-error" className="cc-error" role="alert">{actionError}</p> : null}

        {isPaused ? (
          <div className="cc-paused" role="status" data-testid="paused-banner">
            <BeVe ref={pausedMascotRef} pose="sleep" size={64} />
            <p>{m.pausedBanner}</p>
            <button type="button" className="d-pill d-pill-go" onClick={() => void pauseQueue()}>{m.resume}</button>
          </div>
        ) : null}

        <div className="cc-cols">
          <div className="cc-left">
            <section className="cc-serve" aria-label={m.serving} data-testid="serving-card">
              <div className="cc-between">
                <span className="cc-lbl">{m.serving}</span>
                {serving?.calledAt ? <span className="cc-ago">{m.calledAgo} {mmss(now - serving.calledAt)}</span> : null}
              </div>
              {serving ? (
                <>
                  <div className="cc-sv">
                    <div ref={servingNumRef} className="cc-bigno" data-testid="serving-number">{serving.displayNumber}</div>
                    <div>
                      <b>{serving.customerName}</b>
                      <small>{serving.paxCount} {guestNoun} · {tableOf(serving)} · {sourceLabel(serving)}</small>
                    </div>
                  </div>
                  <div className="cc-acts">
                    <button type="button" className="cc-b cc-b-g" onClick={seatServing}>{m.seat} <kbd className="d-kbd">↵</kbd></button>
                    <button type="button" className="cc-b cc-b-ol" onClick={holdServing}>{m.hold} <kbd className="d-kbd">H</kbd></button>
                  </div>
                </>
              ) : (
                <p className="cc-sv-empty">—</p>
              )}
            </section>

            <section className="cc-next">
              <span className="cc-lbl d-muted">{m.next}</span>
              {nextUp ? (
                <div className="cc-nx">
                  <span><b>{nextUp.displayNumber}</b> {nextUp.customerName} · {nextUp.paxCount} {guestNoun}</span>
                  <span>chờ {minsSince(nextUp.createdAt, now)} {m.minutesShort}</span>
                </div>
              ) : (
                <div className="cc-nx"><span>{m.nothingToCall}</span></div>
              )}
              <button
                ref={callBtnRef}
                type="button"
                className="cc-call"
                disabled={isPaused || !nextUp}
                onClick={() => void callTicket(nextUp)}
              >
                {m.callNext} <kbd className="d-kbd">Space</kbd>
              </button>
              <div className="cc-sub3">
                {buckets.map((b) => {
                  const first = waiting.find((t) => t.bucketId === b.id || prefixOf(t) === b.prefix);
                  return (
                    <button key={b.id} type="button" disabled={isPaused || !first} onClick={() => void callTicket(first)}>
                      {m.callNextIn(b.prefix)}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="cc-called" data-testid="summoned-strip">
              <span className="cc-lbl d-muted">{m.calledNotArrived} ({calledNotArrived.length})</span>
              <ul>
                {calledNotArrived.map((t) => {
                  const since = now - (t.heldAt ?? t.calledAt ?? now);
                  const late = t.status === 'HELD' || since > grace;
                  return (
                    <li key={t.id} className="cc-cr">
                      <span className="cc-tk">{t.displayNumber}</span>
                      <span>{t.customerName} · {t.status === 'HELD' ? m.hold : `${t.paxCount} ${guestNoun}`}</span>
                      <span className={late ? 'cc-tmr cc-late' : 'cc-tmr'}>{mmss(since)}{late ? ' ▲' : ''}</span>
                      <button type="button" className="cc-rb" onClick={() => void postTicketAction(t.id, 'SEAT')}>{m.seat}</button>
                      {t.status === 'HELD' ? (
                        <button type="button" className="cc-rb" onClick={() => void postTicketAction(t.id, 'SUMMON')}>{m.recall}</button>
                      ) : (
                        <button type="button" className="cc-rb" onClick={() => void postTicketAction(t.id, 'HOLD')}>{m.hold}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <section className="cc-list" data-testid="waiting-ledger">
            <div className="cc-between">
              <h2>{m.queueTitle} <small>{m.queueSub(snapshot.waitingCount, snapshot.avgWaitMins)}</small></h2>
              <input className="cc-search" type="search" aria-label={m.search} placeholder={m.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="cc-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'ALL'} onClick={() => setTab('ALL')}>{m.tabAll} <em>{waiting.length}</em></button>
              {buckets.map((b) => (
                <button key={b.id} type="button" role="tab" aria-selected={tab === b.id} onClick={() => setTab(b.id)}>
                  {b.maxPax ? m.tabBucket(b.prefix, b.minPax, b.maxPax) : `Bàn ${b.prefix}`}
                  <em>{waiting.filter((t) => t.bucketId === b.id || prefixOf(t) === b.prefix).length}</em>
                </button>
              ))}
              <button type="button" role="tab" aria-selected={tab === 'HELD'} onClick={() => setTab('HELD')}>{m.tabHeld} <em>{held.length}</em></button>
            </div>

            {empty ? (
              <div className="cc-empty" data-testid="empty-state">
                <BeVe ref={emptyMascotRef} pose="idle" size={140} />
                <b>{m.emptyTitle}</b>
                <p className="d-muted">{m.emptyBody}</p>
                <div className="cc-row">
                  <button type="button" className="d-pill" onClick={() => setWalkInOpen(true)}>+ {m.walkIn}</button>
                  <Link className="d-pill" to={`/tv/branch/${branchId}`}>{m.printQr}</Link>
                </div>
              </div>
            ) : (
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>{m.colNumber}</th><th>{m.colGuest}</th><th>{m.colPax}</th><th>{m.colTable}</th><th>{m.colSource}</th><th>{m.colWaited}</th><th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const mins = minsSince(t.createdAt, now);
                    return (
                      <tr key={t.id} data-testid={`waiting-row-${t.id}`}>
                        <td><span className="cc-tk">{t.displayNumber}</span></td>
                        <td className="cc-nm">{t.customerName}</td>
                        <td>{t.paxCount} {guestNoun}</td>
                        <td>{tableOf(t)}</td>
                        <td><span className={t.source === 'HOST_MANUAL' ? 'cc-src cc-src-w' : 'cc-src'}>{sourceLabel(t)}</span></td>
                        <td><span className={`cc-wt cc-wt-${waitTone(mins)}`} data-tone={waitTone(mins)}>{mins} {m.minutesShort}</span></td>
                        <td className="cc-rowacts">
                          <button type="button" className="cc-rb" disabled={isPaused} onClick={() => void (t.status === 'HELD' ? postTicketAction(t.id, 'SUMMON') : callTicket(t))}>{m.summon}</button>
                          <button type="button" className="cc-rb cc-rb-i" aria-label={m.more} onClick={() => setDrawerTicketId(t.id)}>···</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <footer className="cc-stats" data-testid="host-pos-metrics">
          <div className="cc-st"><b>{snapshot.waitingCount}</b>{m.statWaiting}</div>
          <div className="cc-st"><b>{snapshot.avgWaitMins}′</b>{m.statAvg}</div>
          <div className="cc-st"><b>{snapshot.stats?.servedToday ?? '—'}</b>{m.statServed}</div>
          <div className="cc-st"><b>{snapshot.stats?.cancelledToday ?? '—'}</b>{m.statCancelled}</div>
          <div className="cc-st"><b>{snapshot.stats ? vnd(snapshot.stats.walletBalanceVnd) : '—'}</b>{m.statWallet}</div>
        </footer>
      </div>

      {pending ? (
        <div ref={toastRef} className="cc-toast" role="status" data-testid="call-toast">
          <BeVe pose="excited" size={44} />
          <div><b>{m.toastCalled(pending.ticket.displayNumber, pending.ticket.customerName)}</b> · {m.toastPending}</div>
          <button type="button" className="cc-undo" onClick={undo}>{m.undo} <kbd className="d-kbd">Z</kbd></button>
        </div>
      ) : null}

      {drawerTicket ? (
        <div className="cc-overlay" role="presentation" onClick={() => setDrawerTicketId(null)}>
          <div data-testid="row-action-drawer" role="dialog" aria-label={m.more} className="cc-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="cc-lbl d-muted">{drawerTicket.displayNumber}</p>
            <button type="button" className="d-pill" onClick={() => void postTicketAction(drawerTicket.id, 'BUMP_PRIORITY')}>{m.bump}</button>
            <button type="button" className="d-pill" onClick={() => void postTicketAction(drawerTicket.id, 'CHANGE_BUCKET', { paxCount: Math.min(12, drawerTicket.paxCount + 1) })}>{changeLabel}</button>
            <button type="button" className="d-pill cc-danger" onClick={() => void postTicketAction(drawerTicket.id, 'CANCEL')}>{m.cancel}</button>
            <button type="button" className="d-pill" onClick={() => setDrawerTicketId(null)}>{m.close}</button>
          </div>
        </div>
      ) : null}

      {walkInOpen ? (
        <div className="cc-overlay" role="presentation" onClick={() => setWalkInOpen(false)}>
          <div data-testid="walk-in-modal" role="dialog" aria-label={m.walkIn} className="cc-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="cc-lbl d-muted">{m.walkIn}</p>
            <form className="cc-form" onSubmit={(e) => { e.preventDefault(); void submitWalkIn(); }}>
              <label>
                Tên {guestNoun}
                <input type="text" name="customerName" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} autoComplete="name" required autoFocus />
              </label>
              <label>
                Số {guestNoun}
                <input type="number" name="paxCount" min={1} max={12} value={walkInPax} onChange={(e) => setWalkInPax(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </label>
              <div className="cc-row cc-end">
                <button type="button" className="d-pill" onClick={() => setWalkInOpen(false)}>{m.close}</button>
                <button type="submit" className="d-pill d-pill-go" disabled={walkInSubmitting}>{m.walkIn}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
