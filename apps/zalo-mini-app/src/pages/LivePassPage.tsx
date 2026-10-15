/**
 * Screens 2–5 · `/ticket/:ticketId` (Style D):
 * waiting → almost (green banner) → your turn (green + confetti) → served (rating).
 * Animations follow round3/animation-storyboard; reduced motion = crossfades.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { guestCopy, type WsServerEvent } from '@luotdi/shared';
import {
  BeVe,
  Confetti,
  bannerIn,
  greenReveal,
  mascotCelebrate,
  mascotHop,
  mascotPop,
  numberPop,
  numberRoll,
  progressTo,
  ticketIssue,
  vibrate,
} from '@luotdi/design-d';
import { followOA } from 'zmp-sdk';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { apiFetch } from '../lib/api';
import { useZaloIdentity } from '../hooks/useZaloIdentity';
import { phaseOf, type GuestPhase } from '../lib/phase';

type TicketPayload = {
  id: string;
  displayNumber: string;
  status: string;
  branchId: string;
  branchName: string;
  bucketId: string;
  bucketPrefix?: string;
  paxCount: number;
  nowServing: string;
  partiesAhead: number;
  estimatedWaitMins: number;
  calledAt?: number | null;
  graceMins?: number;
  isPaused?: boolean;
};

const POLL_MS = 15_000;

function hhmm(ms: number): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(ms);
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Steps({ phase }: { phase: GuestPhase }) {
  const idx = phase === 'waiting' ? 1 : phase === 'almost' ? 2 : 3;
  const labels = [guestCopy.stepIssued, guestCopy.stepWaiting, guestCopy.stepSoon, guestCopy.stepTurn];
  return (
    <div className="d-steps" data-testid="steps">
      {labels.map((l, i) => (
        <div key={l} className="d-step" data-state={i < idx ? 'done' : i === idx ? 'now' : 'todo'}>
          <i>{i < idx ? <Check /> : i === idx ? String(i + 1) : ''}</i>
          {l}
        </div>
      ))}
    </div>
  );
}

export function LivePassPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  // GET /api/tickets/:id is owner-only, so wait for the guest JWT.
  const identity = useZaloIdentity();
  const [cancelling, setCancelling] = useState(false);
  const justIssued = Boolean((location.state as { justIssued?: boolean } | null)?.justIssued);

  const [ticket, setTicket] = useState<TicketPayload | null>(null);
  const [calledEvent, setCalledEvent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [ack, setAck] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [ratingSent, setRatingSent] = useState(false);
  const firstAhead = useRef<number | null>(null);
  const prevPhase = useRef<GuestPhase | null>(null);
  const prevServing = useRef<string | null>(null);
  const prevProgress = useRef(0);

  const ticketRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const servingRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const bigNumRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!ticketId || !identity.ready) return;
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}`);
      if (!res.ok) {
        setError('Không tìm thấy số.');
        return;
      }
      const data = (await res.json()) as TicketPayload;
      setTicket(data);
      setOffline(false);
      if (firstAhead.current === null) firstAhead.current = Math.max(1, data.partiesAhead + 1);
    } catch {
      setOffline(true);
      setError((e) => e ?? 'Không tải được số.');
    }
  }, [ticketId, identity.ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const onEvent = useCallback(
    (event: WsServerEvent) => {
      if (event.type === 'YOUR_TURN_CALLED' && event.ticketId === ticketId) setCalledEvent(true);
      if (event.type === 'QUEUE_UPDATED') void load();
    },
    [ticketId, load],
  );

  const { connected } = useQueueSocket({ branchId: ticket?.branchId, ticketId, onEvent });

  // Polling fallback while the socket is down (WebView background, flaky network).
  useEffect(() => {
    if (connected || !ticket) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [connected, ticket, load]);

  const graceEndsAt = ticket?.calledAt ? ticket.calledAt + (ticket.graceMins ?? 5) * 60_000 : null;
  useEffect(() => {
    if (!graceEndsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [graceEndsAt]);

  const phase: GuestPhase | null = ticket
    ? phaseOf(ticket, { calledEvent, graceExpired: graceEndsAt != null && now > graceEndsAt })
    : null;

  // Phase-entry animations + haptics (only on real state changes).
  useEffect(() => {
    if (!phase || prevPhase.current === phase) return;
    const first = prevPhase.current === null;
    prevPhase.current = phase;
    if (phase === 'waiting' && first && justIssued) {
      ticketIssue(ticketRef.current);
      mascotPop(mascotRef.current);
    } else if (phase === 'almost') {
      bannerIn(bannerRef.current);
      mascotHop(mascotRef.current);
      if (!first) vibrate('almost');
    } else if (phase === 'yourTurn') {
      greenReveal(revealRef.current);
      numberPop(bigNumRef.current);
      mascotCelebrate(mascotRef.current);
      vibrate('yourTurn');
    } else {
      mascotPop(mascotRef.current);
    }
  }, [phase, justIssued]);

  // Queue moved: roll "Đang gọi", grow progress.
  const progress = ticket && firstAhead.current ? Math.min(1, 1 - ticket.partiesAhead / firstAhead.current) : 0;
  useEffect(() => {
    if (!ticket) return;
    if (prevServing.current !== null && prevServing.current !== ticket.nowServing) numberRoll(servingRef.current);
    prevServing.current = ticket.nowServing;
    if (progress !== prevProgress.current) {
      progressTo(progressRef.current, prevProgress.current, progress);
      prevProgress.current = progress;
    }
  }, [ticket, progress]);

  if (identity.status === 'error' && !ticket) {
    return (
      <section className="zma-page zma-center" data-testid="identity-error">
        <BeVe pose="offline" size={140} />
        <p className="d-bubble">{guestCopy.authFailed}</p>
        <button type="button" className="d-btn d-btn-yellow" onClick={identity.retry}>{guestCopy.retry}</button>
      </section>
    );
  }
  if (error && !ticket) {
    return (
      <section className="zma-page zma-center">
        <BeVe pose="offline" size={140} />
        <p className="d-bubble">{error}</p>
      </section>
    );
  }
  if (!ticket || !phase) {
    return (
      <section className="zma-page zma-center">
        <p className="d-muted">Đang tải.</p>
      </section>
    );
  }

  const table = guestCopy.table(ticket.bucketPrefix ?? ticket.displayNumber.charAt(0));
  const offlineBanner = offline ? (
    <div className="zma-banner zma-banner-plain" role="status" data-testid="offline-banner">
      <BeVe pose="offline" size={44} />
      <p>{guestCopy.offlineBody}</p>
    </div>
  ) : null;

  // ── Screen 4 · Your turn ────────────────────────────────────────────
  if (phase === 'yourTurn') {
    const left = graceEndsAt ? graceEndsAt - now : null;
    return (
      <section data-testid="live-pass" className="zma-page zma-turn d-green-screen" data-screen="your-turn">
        <div ref={revealRef} className="d-reveal" aria-hidden />
        <Confetti />
        <div data-testid="live-pass-chassis" data-phase="yourTurn" className="zma-turn-body" aria-live="assertive">
          <BeVe ref={mascotRef} pose="celebrate" size={170} num={ticket.displayNumber} />
          <h1 className="d-lx zma-turn-title">{guestCopy.yourTurnTitle}</h1>
          <div ref={bigNumRef} className="d-ticket zma-turn-ticket">
            <p className="zma-turn-cap">{guestCopy.ticketLabel}</p>
            <div data-testid="ticket-display-number" className="d-num d-num-hero">{ticket.displayNumber}</div>
          </div>
          <p className="zma-turn-proceed">{guestCopy.proceedTo(table)}</p>
          {left != null ? (
            <div className="zma-hold" data-testid="hold-countdown">
              <span className="zma-hold-ring" style={{ ['--p' as string]: String(Math.max(0, left) / ((ticket.graceMins ?? 5) * 60_000)) }} />
              <div>
                {guestCopy.holdFor} <b>{mmss(left)}</b>
                <small>{guestCopy.holdHint}</small>
              </div>
            </div>
          ) : null}
        </div>
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-yellow" onClick={() => setAck(true)} disabled={ack}>
            {ack ? guestCopy.arrivedAck : guestCopy.arrived}
          </button>
        </div>
      </section>
    );
  }

  // ── Screen 5 · Served ───────────────────────────────────────────────
  if (phase === 'served') {
    const oaId = import.meta.env.VITE_ZALO_OA_ID as string | undefined;
    return (
      <section data-testid="live-pass" className="zma-page zma-center" data-screen="served">
        <BeVe ref={mascotRef} pose="thanks" size={150} num={ticket.displayNumber} />
        <h1 className="d-lx zma-h1">{guestCopy.thanksTitle(ticket.branchName)}</h1>
        <div data-testid="live-pass-chassis" data-phase="served" hidden />
        <div className="d-card zma-rate">
          {ratingSent ? (
            <p className="zma-ok" role="status">{guestCopy.ratingThanks}</p>
          ) : (
            <>
              <p className="d-label">{guestCopy.ratePrompt}</p>
              <div className="zma-stars" role="radiogroup" aria-label={guestCopy.ratePrompt}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={String(n)} onClick={() => setRating(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="zma-row zma-between d-muted"><small>{guestCopy.rateLow}</small><small>{guestCopy.rateHigh}</small></div>
              <div className="zma-row zma-wrap">
                {guestCopy.reasons.map((r) => {
                  const on = reasons.includes(r);
                  return (
                    <button key={r} type="button" aria-pressed={on} className={on ? 'd-chip d-chip-yellow' : 'd-chip'} onClick={() => setReasons((xs) => (on ? xs.filter((x) => x !== r) : [...xs, r]))}>
                      {on ? <Check /> : null}
                      {r}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {!ratingSent ? (
          <div className="zma-cta">
            <button type="button" className="d-btn d-btn-green" disabled={rating == null} onClick={() => setRatingSent(true)}>
              {guestCopy.sendRating}
            </button>
            {oaId ? (
              <button type="button" className="d-btn d-btn-text" onClick={() => void followOA({ id: oaId }).catch(() => undefined)}>
                {guestCopy.followOa(ticket.branchName)}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  if (phase === 'cancelled') {
    return (
      <section data-testid="live-pass" className="zma-page zma-center" data-screen="cancelled">
        <BeVe pose="offline" size={120} />
        <h1 className="d-lx zma-h1">{guestCopy.cancelledTitle}</h1>
        <div className="d-ticket zma-ticket-grey" data-testid="ticket-cancelled">
          <div data-testid="ticket-display-number" className="d-num d-num-hero zma-num zma-struck">{ticket.displayNumber}</div>
          <p className="zma-tsub">{table} · {ticket.branchName}</p>
        </div>
        <p className="d-muted">{guestCopy.cancelledHint}</p>
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-green" onClick={() => navigate('/')}>{guestCopy.newTicket}</button>
        </div>
      </section>
    );
  }

  const cancel = async () => {
    setCancelling(true);
    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}/cancel`, { method: 'POST' });
      if (res.ok) setTicket({ ...ticket, status: 'CANCELLED' });
    } catch {
      setOffline(true);
    } finally {
      setCancelling(false);
    }
  };

  // ── Screens 2/3 · Waiting / Almost (+ late, paused) ─────────────────
  const almost = phase === 'almost';
  const late = phase === 'late';
  const paused = Boolean(ticket.isPaused) && !late;
  return (
    <section data-testid="live-pass" className="zma-page" data-screen={phase}>
      {offlineBanner}
      {almost ? (
        <div ref={bannerRef} className="zma-banner zma-banner-green" role="status" data-testid="almost-banner">
          <div>
            <b className="d-lx">{guestCopy.almostTitle}</b>
            <p>{guestCopy.almostBody(Math.max(1, ticket.partiesAhead), Math.max(1, ticket.estimatedWaitMins))}</p>
          </div>
          <BeVe ref={mascotRef} pose="excited" size={72} num={ticket.displayNumber} />
        </div>
      ) : null}
      {late ? (
        <div className="zma-banner zma-banner-hot" role="alert" data-testid="late-banner">
          <BeVe ref={mascotRef} pose="late" size={64} />
          <div><b className="d-lx">{guestCopy.lateTitle}</b><p>{guestCopy.lateBody}</p></div>
        </div>
      ) : null}
      {paused ? (
        <div className="zma-banner zma-banner-yellow" role="status" data-testid="paused-banner">
          <BeVe pose="sleep" size={56} />
          <p>{guestCopy.pausedBody}</p>
        </div>
      ) : null}

      <div ref={ticketRef} data-testid="live-pass-chassis" data-phase={phase} className={offline ? 'd-ticket zma-ticket-grey' : 'd-ticket'}>
        <div className="zma-row zma-between">
          <span>{guestCopy.ticketLabel}</span>
          {offline ? (
            <span className="d-chip" data-testid="chip-stale">{guestCopy.notUpdated}</span>
          ) : late && ticket.calledAt ? (
            <span className="d-chip d-chip-yellow" data-testid="chip-called">{guestCopy.calledAt(hhmm(ticket.calledAt))}</span>
          ) : paused ? (
            <span className="d-chip d-chip-yellow" data-testid="chip-holding">{guestCopy.holdingTurn}</span>
          ) : (
            <span className={almost ? 'd-chip' : 'd-chip d-chip-navy'}>{almost ? guestCopy.statusSoon : guestCopy.statusWaiting}</span>
          )}
        </div>
        <div data-testid="ticket-display-number" className="d-num d-num-hero zma-num">{ticket.displayNumber}</div>
        <p className="zma-tsub">{table} · {ticket.paxCount} khách · {ticket.branchName}</p>
        <div className="d-ticket-perf" />
        <div data-testid="live-pass-metrics" className="d-metrics" aria-live="polite">
          <div><span>{guestCopy.nowServing}</span><b ref={servingRef}>{ticket.nowServing}</b></div>
          <div><span>{guestCopy.ahead}</span><b>{ticket.partiesAhead} <small>{guestCopy.groups}</small></b></div>
          <div><span>{guestCopy.estWait}</span>{paused ? <b data-testid="wait-paused">—</b> : <b>{ticket.estimatedWaitMins} <small>{guestCopy.minutes}</small></b>}</div>
        </div>
      </div>

      <div className="d-card">
        <Steps phase={phase} />
        <div className={offline ? 'd-track zma-track-grey' : 'd-track'} style={{ marginTop: 12 }}>
          <i ref={progressRef} style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p className="zma-row zma-between d-muted" style={{ marginTop: 8 }}>
          <small>{paused ? guestCopy.pausedFoot : guestCopy.turnsLeft(ticket.partiesAhead)}</small>
        </p>
      </div>

      {late && graceEndsAt ? (
        <div className="zma-latebox" data-testid="late-hold">
          <span className="zma-hold-ring" style={{ ['--p' as string]: String(Math.max(0, graceEndsAt - now) / ((ticket.graceMins ?? 5) * 60_000)) }} />
          <div>
            <b className="d-num">{mmss(graceEndsAt - now)}</b> {guestCopy.holdLeft}
            <small>{guestCopy.holdLeftBody}</small>
          </div>
        </div>
      ) : null}

      {offline ? (
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-yellow" onClick={() => void load()}>{guestCopy.retryNow}</button>
          <p className="zma-foot">{guestCopy.autoResume}</p>
        </div>
      ) : null}

      {!almost && !late ? (
        <div className="zma-row zma-greet">
          <BeVe ref={paused ? undefined : mascotRef} pose={paused ? 'sleep' : 'idle'} size={60} />
          <p className="d-bubble">{guestCopy.waitingBubble}</p>
        </div>
      ) : null}

      {late && !offline ? (
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-green" onClick={() => setAck(true)} disabled={ack}>
            {ack ? guestCopy.onMyWayAck : guestCopy.onMyWay}
          </button>
          <button type="button" className="zma-link" style={{ alignSelf: 'center' }} disabled={cancelling} onClick={() => void cancel()}>
            {guestCopy.notComing}
          </button>
        </div>
      ) : null}

      {almost && !offline ? (
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-green" onClick={() => setAck(true)} disabled={ack}>
            {ack ? guestCopy.onMyWayAck : guestCopy.onMyWay}
          </button>
        </div>
      ) : null}
    </section>
  );
}
