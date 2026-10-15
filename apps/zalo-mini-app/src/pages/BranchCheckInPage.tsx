/**
 * Screen 1 · Lấy số — `/b/:qrToken` (Style D).
 * Bé Vé greets, party size → Bàn A/B/C, name from Zalo, opt-in to Zalo notify.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { guestCopy } from '@luotdi/shared';
import { BeVe, mascotPop, tapPress, vibrate } from '@luotdi/design-d';
import { requestSendNotification } from 'zmp-sdk';
import { useZaloIdentity } from '../hooks/useZaloIdentity';
import { apiFetch } from '../lib/api';
import { ticketErrorMessage } from '../lib/ticketError';

type BranchBucket = {
  id: string;
  prefix: string;
  labelVi?: string;
  minPax: number;
  maxPax: number;
  partiesWaiting: number;
  estimatedWaitMins: number;
  activeCounters?: number;
};

type BranchPayload = {
  id: string;
  name: string;
  district: string;
  city: string;
  routingMode: string;
  category: string;
  isPaused?: boolean;
  waitingCount?: number;
  buckets: BranchBucket[];
};

/** Party options from the round-3 join screen. `pax` is what we send. */
export const PARTY_OPTIONS = [
  { key: '1', label: '1', pax: 1 },
  { key: '2', label: '2', pax: 2 },
  { key: '3-4', label: '3–4', pax: 3 },
  { key: '5+', label: '5+', pax: 5 },
] as const;

function matchBucket(buckets: BranchBucket[], paxCount: number) {
  return buckets.find((b) => paxCount >= b.minPax && paxCount <= b.maxPax);
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join('') || 'K';
}

function brandBadge(name: string): string {
  const m = name.match(/[A-Za-zÀ-ỹ]+|\d+/g) ?? ['L'];
  return (m[0]![0]! + (m.find((x) => /\d/.test(x)) ?? m[1]?.[0] ?? '')).toUpperCase().slice(0, 3);
}

export function BranchCheckInPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const navigate = useNavigate();
  const identity = useZaloIdentity();
  const { customerName: zaloName, ready } = identity;

  const [branch, setBranch] = useState<BranchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTicket, setActiveTicket] = useState<{ id: string; displayNumber: string } | null>(null);
  const [partyKey, setPartyKey] = useState<string>('2');
  const [serviceBucketId, setServiceBucketId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [notify, setNotify] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const mascotRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!nameTouched && ready) setName(zaloName === 'Khách' ? '' : zaloName);
  }, [zaloName, ready, nameTouched]);

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/branches/by-qr/${encodeURIComponent(qrToken)}`);
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 404) setNotFound(true);
            else setError(guestCopy.ticketErrors.UNKNOWN!);
          }
          return;
        }
        const data = (await res.json()) as BranchPayload;
        if (!cancelled) setBranch(data);
      } catch {
        if (!cancelled) setError('Không tải được chi nhánh.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  useEffect(() => {
    if (branch) mascotPop(mascotRef.current);
  }, [branch]);

  const isServiceType = branch?.routingMode === 'SERVICE_TYPE';
  const paxCount = PARTY_OPTIONS.find((o) => o.key === partyKey)?.pax ?? 2;

  const matched = useMemo(() => {
    if (!branch) return undefined;
    if (isServiceType) return branch.buckets.find((b) => b.id === serviceBucketId) ?? branch.buckets[0];
    return matchBucket(branch.buckets, paxCount);
  }, [branch, isServiceType, paxCount, serviceBucketId]);

  const customerName = name.trim() || (zaloName || 'Khách');

  const issuePass = useCallback(async () => {
    if (!branch || !ready || issuing || !matched) return;
    tapPress(btnRef.current);
    setIssuing(true);
    setError(null);
    if (notify) {
      // Best effort: Zalo shows its own consent sheet; skipping never blocks check-in.
      try {
        void requestSendNotification().catch(() => undefined);
      } catch {
        /* not inside Zalo */
      }
    }
    let res: Response | null = null;
    try {
      res = await apiFetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branch.id,
          ...(isServiceType ? { bucketId: matched.id, paxCount: 1 } : { paxCount }),
          customerName,
        }),
      });
    } catch {
      res = null;
    }
    try {
      if (!res || !res.ok) {
        if (res?.status === 409) {
          const body = (await res.clone().json().catch(() => ({}))) as { code?: string; activeTicket?: { id: string; displayNumber: string } };
          if (body.code === 'ACTIVE_TICKET_EXISTS' && body.activeTicket) setActiveTicket(body.activeTicket);
        }
        setError(await ticketErrorMessage(res));
        return;
      }
      const ticket = (await res.json()) as { id: string };
      vibrate('issued');
      navigate(`/ticket/${ticket.id}`, { state: { justIssued: true } });
    } finally {
      setIssuing(false);
    }
  }, [branch, ready, issuing, matched, notify, isServiceType, paxCount, customerName, navigate]);

  if (notFound) {
    return (
      <section className="zma-page zma-center" data-screen="branch-not-found">
        <BeVe pose="offline" size={150} />
        <h1 className="d-lx zma-h1">{guestCopy.notFoundTitle}</h1>
        <p className="d-muted">{guestCopy.notFoundBody}</p>
        <div className="zma-cta">
          <button type="button" className="d-btn d-btn-green" onClick={() => navigate('/')}>{guestCopy.findNearby}</button>
          <p className="zma-foot">{guestCopy.scanAgain}</p>
        </div>
      </section>
    );
  }

  if (error && !branch) {
    return (
      <section className="zma-page zma-center">
        <BeVe pose="offline" size={140} />
        <p className="d-bubble">{error}</p>
      </section>
    );
  }

  if (!branch) {
    return (
      <section className="zma-page" aria-busy="true" data-screen="join-loading">
        <div className="zma-skel" style={{ height: 60 }} />
        <div className="zma-skel" style={{ height: 160 }} />
        <div className="zma-skel" style={{ height: 120 }} />
      </section>
    );
  }

  const paused = Boolean(branch.isPaused);
  const isClinic = isServiceType || branch.category === 'CLINIC';

  const avgWait = matched?.estimatedWaitMins ?? 0;
  const dupe = activeTicket != null;

  return (
    <section className="zma-page" data-screen={paused ? 'join-paused' : 'join'}>
      <header className="zma-brand">
        <span className="zma-logo">{brandBadge(branch.name)}</span>
        <div>
          <h1>{branch.name}</h1>
          <small>
            {branch.district}
            {matched && !isServiceType ? ` · ${guestCopy.table(matched.prefix)}` : ''}
          </small>
        </div>
      </header>

      <div className="zma-row">
        <span className={paused ? 'd-chip d-chip-yellow' : 'd-chip d-chip-green'}>
          <i className="d-dot" />
          {paused ? guestCopy.paused : guestCopy.open}
        </span>
        {typeof branch.waitingCount === 'number' ? (
          <span className="d-chip d-chip-yellow">
            {branch.waitingCount} {guestCopy.groupsWaiting}
          </span>
        ) : null}
        {matched && !paused ? <span className="d-chip">~{avgWait} {guestCopy.minutes}</span> : null}
      </div>

      {paused ? (
        <div className="zma-center" data-testid="join-paused" style={{ paddingTop: 8 }}>
          <BeVe ref={mascotRef} pose="sleep" size={150} />
          <b className="d-lx" style={{ fontSize: 22 }}>{guestCopy.pausedTitle}</b>
          <p className="d-bubble">{guestCopy.pausedJoinBody}</p>
        </div>
      ) : dupe ? (
        <>
          <div className="zma-row zma-greet" data-testid="dupe-ticket">
            <BeVe ref={mascotRef} pose="late" size={64} />
            <p className="d-bubble">{guestCopy.ticketErrors.ACTIVE_TICKET_EXISTS}</p>
          </div>
          <button type="button" className="zma-pinned" onClick={() => navigate(`/ticket/${activeTicket.id}`)}>
            <div style={{ textAlign: 'left' }}>
              <small>{guestCopy.yourTicketHere}</small>
              <b className="d-num">{activeTicket.displayNumber}</b>
            </div>
            <span aria-hidden="true" className="zma-pinned-go">›</span>
          </button>
        </>
      ) : (
        <>
          <div className="zma-row zma-greet">
            <BeVe ref={mascotRef} pose="idle" size={64} />
            <p className="d-bubble">{isServiceType ? guestCopy.serviceGreeting : guestCopy.joinGreeting}</p>
          </div>

          <div className="d-card">
            {isServiceType ? (
              <>
                <p className="d-label">{guestCopy.chooseService}</p>
                <div role="radiogroup" aria-label={guestCopy.chooseService}>
                  {branch.buckets.map((b) => (
                    <button key={b.id} type="button" role="radio" className="zma-svc" aria-label={b.labelVi ?? b.prefix} aria-checked={matched?.id === b.id} onClick={() => setServiceBucketId(b.id)}>
                      <span className="zma-svc-p">{b.prefix}</span>
                      <span className="zma-svc-b">
                        <b>{b.labelVi ?? b.prefix}</b>
                        <small>{[b.activeCounters ? guestCopy.counters(b.activeCounters) : null, `~${b.estimatedWaitMins} ${guestCopy.minutes}`].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className="zma-svc-n">{b.partiesWaiting}<small>{guestCopy.servicesWaiting(b.partiesWaiting).replace(/^\d+\s/, '')}</small></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="d-label">{guestCopy.partySize}</p>
                <div className="d-seg" role="radiogroup" aria-label={guestCopy.partySize}>
                  {PARTY_OPTIONS.map((o) => {
                    const b = matchBucket(branch.buckets, o.pax);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="radio"
                        aria-label={o.label}
                        aria-checked={partyKey === o.key}
                        onClick={() => setPartyKey(o.key)}
                      >
                        {o.label}
                        <small>{b ? guestCopy.table(b.prefix) : '—'}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {matched ? (
              <span data-testid="matched-bucket" data-active="true" hidden>
                {matched.prefix}
              </span>
            ) : (
              <p data-testid="no-bucket" className="zma-warn">{guestCopy.noBucketForParty}</p>
            )}
          </div>

          <div className="d-card">
            <label className="d-label" htmlFor="guest-name">{isClinic ? guestCopy.patientName : guestCopy.yourName}</label>
            <div className="zma-input">
              <span className="zma-avatar">{initials(customerName)}</span>
              <input
                id="guest-name"
                value={name}
                placeholder={zaloName}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
              <small className="d-muted">{guestCopy.fromZalo}</small>
            </div>
            <div className="zma-row zma-notify">
              <span id="notify-label">{guestCopy.notifyMe}</span>
              <button type="button" role="switch" className="d-toggle" aria-checked={notify} aria-labelledby="notify-label" onClick={() => setNotify((v) => !v)} />
            </div>
          </div>
        </>
      )}

      {error && !dupe ? (
        <div role="alert" data-testid="issue-error" className="zma-errrow">
          <BeVe pose="offline" size={36} />
          <p>{error}</p>
        </div>
      ) : null}

      {identity.status === 'loading' && !paused ? (
        <div className="zma-center" style={{ padding: 0, gap: 6 }} data-testid="signing-in">
          <div className="zma-progress" role="progressbar" aria-label={guestCopy.signingIn}><i /></div>
        </div>
      ) : null}

      {identity.status === 'error' ? (
        <div data-testid="identity-error" className="zma-errrow">
          <BeVe pose="offline" size={36} />
          <p style={{ flex: 1 }}>{guestCopy.authFailed}</p>
          <button type="button" className="d-pill" onClick={identity.retry}>{guestCopy.retry}</button>
        </div>
      ) : null}

      <div className="zma-cta">
        {dupe ? (
          <>
            <button type="button" className="d-btn d-btn-green" onClick={() => navigate(`/ticket/${activeTicket.id}`)}>{guestCopy.viewMyTicket}</button>
          </>
        ) : (
          <button
            ref={btnRef}
            type="button"
            className="d-btn d-btn-green"
            disabled={paused || !ready || issuing || !matched}
            aria-busy={identity.status === 'loading' || issuing || undefined}
            onClick={() => void issuePass()}
          >
            {identity.status === 'loading' ? guestCopy.signingIn : guestCopy.issuePass}
          </button>
        )}
        {paused ? (
          <button type="button" className="zma-link" style={{ alignSelf: 'center' }} onClick={() => navigate('/')}>{guestCopy.otherNearby}</button>
        ) : matched && !dupe ? (
          <p className="zma-foot">
            {isServiceType ? (matched.labelVi ?? matched.prefix) : guestCopy.table(matched.prefix)} · {matched.partiesWaiting} {guestCopy.groups} phía trước · ~{avgWait} {guestCopy.minutes}
          </p>
        ) : null}
      </div>
    </section>
  );
}
