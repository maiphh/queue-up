/**
 * TV display — `/tv/branch/:branchId` (fallback `/tv/:branchSlug`), Style D (round4/tv).
 * Numbers only on screen. States: loading · error · live · calling · paused · empty · offline,
 * plus clinic wording. Calls inside the 6s window are queued, never overlapped.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { tvCopy as t, type WsServerEvent } from '@luotdi/shared';
import {
  BeVe,
  QrCode,
  mascotCelebrate,
  numberFlip,
  prefersReducedMotion,
} from '@luotdi/design-d';
import { useQueueSocket } from '../../hooks/useQueueSocket';
import {
  CALL_FLASH_MS,
  ERROR_RETRY_MS,
  POLL_MS,
  backoffMs,
  deriveTvState,
  isClinic,
  sentenceCase,
  splitNumber,
  vnClock,
  type TvBucket,
  type TvSnapshot,
} from './tvLogic';
import './tv.css';

const VI_DIGIT: Record<string, string> = {
  '0': 'không', '1': 'một', '2': 'hai', '3': 'ba', '4': 'bốn',
  '5': 'năm', '6': 'sáu', '7': 'bảy', '8': 'tám', '9': 'chín',
};

/** Build vi-VN summon phrase from displayNumber e.g. A·014 */
export function buildViSummonSpeech(displayNumber: string): string {
  const cleaned = displayNumber.replace(/\u00B7/g, '').trim();
  const prefix = cleaned.charAt(0);
  const digits = cleaned.slice(1).replace(/\D/g, '');
  const spokenDigits = [...digits].map((d) => VI_DIGIT[d] ?? d).join(' ');
  return `Xin mời quý khách số ${prefix}, ${spokenDigits}, vào bàn`;
}

function speakViSummon(displayNumber: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!Utterance) return;
  const utterance = new Utterance(buildViSummonSpeech(displayNumber));
  utterance.lang = 'vi-VN';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Two-tone pre-chime (~0.6s). Resolves when done; no-op without WebAudio. */
function playChime(): Promise<void> {
  const Ctx =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctx) return Promise.resolve();
  try {
    const ctx = new Ctx();
    [880, 660].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.28);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.28 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.28 + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.28);
      o.stop(ctx.currentTime + i * 0.28 + 0.27);
    });
    return new Promise((r) => setTimeout(() => { void ctx.close().catch(() => undefined); r(); }, 600));
  } catch {
    return Promise.resolve();
  }
}

/** Scale the fixed 1920×1080 canvas to the window. */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function BigNumber({ value }: { value: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (value && prev.current !== value) numberFlip(ref.current);
    prev.current = value;
  }, [value]);
  const parts = value ? splitNumber(value) : null;
  return (
    <div ref={ref} className={value ? 'tv-bigtk' : 'tv-bigtk tv-bigtk-none'} data-testid="tv-now-number">
      {parts ? (
        <>
          {parts[0]}
          <span className="tv-dot">·</span>
          {parts[1]}
        </>
      ) : (
        value ?? '—'
      )}
    </div>
  );
}

function Clock({ now }: { now: number }) {
  const c = vnClock(now);
  return (
    <div className="tv-clock">
      {c.time}
      <small>{c.date}</small>
    </div>
  );
}

function bucketTitle(b: TvBucket, clinic: boolean): string {
  return clinic ? sentenceCase(b.labelVi) : t.bucketTitle(b.prefix, b.minPax, b.maxPax);
}

export function TvKioskPage() {
  const { branchId, branchSlug } = useParams<{ branchId?: string; branchSlug?: string }>();
  const [snapshot, setSnapshot] = useState<TvSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failing, setFailing] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [calling, setCalling] = useState<{ num: string; at: number } | null>(null);
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const failCount = useRef(0);
  const snapRef = useRef<TvSnapshot | null>(null);
  snapRef.current = snapshot;
  const scale = useFitScale();
  const now = useNow();
  const reduced = prefersReducedMotion() || snapshot?.tv?.staticMode === true;

  const url = branchId
    ? `/api/branches/${branchId}/tv`
    : branchSlug
      ? `/api/branches/slug/${branchSlug}`
      : null;

  const load = useCallback(async (): Promise<'ok' | 'notfound' | 'fail'> => {
    if (!url) return 'notfound';
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        setNotFound(true);
        return 'notfound';
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as TvSnapshot;
      setSnapshot(data);
      setNotFound(false);
      setFailing(false);
      setLastOkAt(Date.now());
      failCount.current = 0;
      return 'ok';
    } catch {
      if (snapRef.current) setFailing(true);
      failCount.current += 1;
      return 'fail';
    }
  }, [url]);

  // Poll: 10s when healthy, backoff when offline, 30s when the branch is unknown.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      const r = await load();
      if (stopped) return;
      const delay = r === 'ok' ? POLL_MS : r === 'notfound' ? ERROR_RETRY_MS : backoffMs(failCount.current - 1);
      timer = setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // Screen wake-lock so the TV never sleeps.
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    void (async () => {
      try {
        if (nav.wakeLock?.request) sentinel = await nav.wakeLock.request('screen');
      } catch {
        /* wake-lock optional */
      }
    })();
    return () => {
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  const runQueue = useCallback(() => {
    if (busyRef.current) return;
    const num = queueRef.current.shift();
    if (!num) return;
    busyRef.current = true;
    setCalling({ num, at: Date.now() });
    const tv = snapRef.current?.tv;
    void (async () => {
      if (tv?.chime !== false) await playChime();
      if (tv?.tts !== false) speakViSummon(num);
    })();
    setTimeout(() => {
      busyRef.current = false;
      setCalling(null);
      void load();
      runQueue();
    }, CALL_FLASH_MS);
  }, [load]);

  const onEvent = useCallback(
    (event: WsServerEvent) => {
      // The DO fans QUEUE_UPDATED{status:CALLED} out to TVs (YOUR_TURN_CALLED only
      // reaches the guest's own socket), so both count as a call.
      const isCall =
        event.type === 'YOUR_TURN_CALLED' || (event.type === 'QUEUE_UPDATED' && event.status === 'CALLED');
      if (isCall) {
        if (!queueRef.current.includes(event.displayNumber)) queueRef.current.push(event.displayNumber);
        runQueue();
      } else {
        void load();
      }
    },
    [load, runQueue],
  );

  useQueueSocket({ branchId: snapshot?.branchId, role: 'TV', onEvent });

  const state = deriveTvState({ snapshot, notFound, failing, calling: calling !== null });
  const mascotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state === 'calling') mascotCelebrate(mascotRef.current, reduced);
  }, [state, calling?.num, reduced]);

  const stageStyle = { transform: `scale(${scale})` };

  if (!url || state === 'error') {
    const path = branchId ? `/tv/branch/${branchId}` : `/tv/${branchSlug ?? ''}`;
    return (
      <div className="tv-stage d-root" data-page="tv-kiosk" data-state="error">
        <div className="tv" style={stageStyle}>
          <div className="tv-top">
            <div className="tv-logo">L</div>
            <div className="tv-bn">LượtĐi<small>{t.screenName}</small></div>
            <span className="tv-sp" />
            <Clock now={now} />
          </div>
          <div className="tv-center">
            <BeVe pose="offline" size={280} />
            <h1>{url ? t.notFound : t.missingBranch}</h1>
            <p>{t.notFoundBody}</p>
            <code>{path}</code>
            <p>{t.autoRetry}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'loading' || !snapshot) {
    return (
      <div className="tv-stage d-root" data-page="tv-kiosk" data-state="loading">
        <div className="tv" style={stageStyle}>
          <div className="tv-top">
            <div className="tv-logo">L</div>
            <div className="tv-skel" style={{ width: 520, height: 56 }} />
            <span className="tv-sp" />
            <Clock now={now} />
          </div>
          <div className="tv-body">
            <div className="tv-hero tv-loading">
              <BeVe pose="idle" size={220} />
              <div className="tv-lbl">{t.loading}</div>
              <p>{t.loadingBody}</p>
            </div>
            <div className="tv-side">
              <div className="tv-sideh"><b>{t.next}</b></div>
              {[0, 1, 2].map((i) => <div key={i} className="tv-skel" style={{ height: 210 }} />)}
              <div className="tv-skel" style={{ height: 216, marginTop: 'auto' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const clinic = isClinic(snapshot);
  const noun = clinic ? 'bệnh nhân' : 'nhóm';
  const paused = state === 'paused' || (state === 'offline' && snapshot.isPaused);
  const showMascot = snapshot.tv?.mascot !== false;
  const ns = snapshot.nowServing ?? null;
  const heroNum = calling?.num ?? ns?.displayNumber ?? null;
  const heroPrefix = heroNum ? (splitNumber(heroNum)?.[0] ?? heroNum.charAt(0)) : null;
  const heroBucket = heroPrefix ? snapshot.buckets.find((b) => b.prefix === heroPrefix) : undefined;
  const where = clinic ? t.inviteClinic : heroPrefix ? t.inviteTable(heroPrefix) : t.waitingFirst;
  const sub = heroBucket
    ? clinic
      ? t.clinicSub(sentenceCase(heroBucket.labelVi))
      : t.tableSub(heroBucket.minPax, heroBucket.maxPax)
    : ns && !clinic
      ? t.tableSub(ns.minPax, ns.maxPax)
      : '';
  const recent = (snapshot.recent ?? []).map((r) => r.displayNumber).filter((n) => n !== heroNum).slice(0, 3);
  const statusChip =
    state === 'offline' ? (
      <span className="tv-st tv-st-off" data-testid="tv-status"><i />{t.offline}</span>
    ) : paused ? (
      <span className="tv-st tv-st-pause" data-testid="tv-status"><i />{t.paused}</span>
    ) : (
      <span className="tv-st tv-st-open" data-testid="tv-status"><i />{t.open}</span>
    );
  const lastOk = lastOkAt ? vnClock(lastOkAt).time : vnClock(now).time;

  let hero;
  if (paused) {
    hero = (
      <div className="tv-hero tv-pz" data-testid="tv-summoning-panel">
        <div className="tv-lbl">{t.pausedLabel}</div>
        <div className="tv-msg">
          <BeVe pose="sleep" size={300} />
          <div>
            <h2>{t.pausedTitle}</h2>
            <p>{t.pausedBody}</p>
          </div>
        </div>
        {ns ? (
          <div className="tv-recent">{t.lastCalled} <span className="tv-rk">{ns.displayNumber}</span></div>
        ) : null}
      </div>
    );
  } else if (state === 'empty') {
    hero = (
      <div className="tv-hero" data-testid="tv-summoning-panel">
        <div className="tv-lbl">{t.nowSummoning}</div>
        <div className="tv-msg">
          <BeVe pose="idle" size={300} num={snapshot.buckets[0] ? `${snapshot.buckets[0].prefix}·001` : undefined} />
          <div>
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyBody}</p>
          </div>
        </div>
        <div className="tv-recent">
          {t.servedTodayLead} <span className="tv-rk">{snapshot.servedToday ?? 0}</span> {noun}
        </div>
      </div>
    );
  } else {
    const isCalling = state === 'calling';
    hero = (
      <div
        className={['tv-hero', isCalling ? 'tv-calling' : '', state === 'offline' ? 'tv-offline' : ''].join(' ')}
        data-testid="tv-summoning-panel"
        data-calling={isCalling ? 'true' : undefined}
      >
        <div className="tv-flash" />
        {isCalling && !reduced ? (
          <>
            <div className="tv-ring" style={{ width: 900, height: 900, left: -120, top: -60 }} />
            <div className="tv-ring" style={{ width: 1300, height: 1300, left: -320, top: -260, opacity: 0.6 }} />
          </>
        ) : null}
        <div className="tv-lbl">{isCalling ? t.calling : t.nowSummoning}</div>
        <BigNumber value={heroNum} />
        <div className="tv-where">
          {where}
          {sub ? <small>{sub}</small> : null}
        </div>
        {isCalling ? (
          <div className="tv-recent">{t.calledAt(vnClock(calling?.at ?? now).time)}</div>
        ) : recent.length > 0 ? (
          <div className="tv-recent" data-testid="tv-recent">
            {t.recent} {recent.map((r) => <span key={r} className="tv-rk">{r}</span>)}
          </div>
        ) : (
          <div className="tv-recent" />
        )}
        {showMascot && state !== 'offline' ? (
          <div className="tv-mascot">
            <BeVe
              ref={mascotRef}
              pose={isCalling ? 'celebrate' : 'idle'}
              size={isCalling ? 190 : 150}
              num={heroNum ?? undefined}
            />
          </div>
        ) : null}
        {state === 'offline' ? (
          <div className="tv-offbar" data-testid="tv-offline-bar">
            <BeVe pose="offline" size={46} />
            {t.reconnecting(lastOk)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="tv-stage d-root" data-page="tv-kiosk" data-state={state}>
      <div className="tv" style={stageStyle} data-testid="tv-kiosk-layout">
        <div className="tv-top">
          <div className="tv-logo">{(snapshot.merchantName ?? snapshot.branchName).charAt(0).toUpperCase()}</div>
          <div className="tv-bn">
            {snapshot.branchName}
            <small>{[snapshot.address, snapshot.district].filter(Boolean).join(', ')}{snapshot.address ? ' · ' : ''}LượtĐi</small>
          </div>
          <span className="tv-sp" />
          {statusChip}
          <Clock now={now} />
        </div>
        <div className="tv-body">
          {hero}
          <div className={paused ? 'tv-side tv-dim' : 'tv-side'} data-testid="tv-sidebar-panel">
            <div className="tv-sideh">
              <b>{paused ? t.holding : t.next}</b>
              <span>{t.numbersOnly}</span>
            </div>
            <div data-testid="tv-bucket-summary" className="tv-side" style={{ gap: 20 }}>
              {snapshot.buckets.map((sb) => ({ ...sb, next: sb.next.filter((x) => x !== heroNum) })).map((b) => (
                <div key={b.id} className="tv-bk" data-testid={`tv-bucket-${b.prefix}`}>
                  <div className="tv-bkh">
                    <span className="tv-px">{b.prefix}</span>
                    {bucketTitle(b, clinic)}
                    <span className="tv-meta">
                      <b>{b.partiesWaiting}</b> {noun}
                      {b.partiesWaiting > 0 ? ` · ${t.waitMins(b.estimatedWaitMins)}` : ''}
                    </span>
                  </div>
                  <div className="tv-nums">
                    {b.next.length > 0 ? (
                      b.next.map((n) => <span key={n}>{n}</span>)
                    ) : (
                      <span className="tv-none">{t.noWait}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className={paused ? 'tv-qrc tv-qrc-off' : 'tv-qrc'} data-testid="walk-in-qr">
              <div className="tv-q">
                <QrCode value={snapshot.walkInQrUrl} size={176} label={`Walk-in QR ${snapshot.walkInQrUrl}`} />
              </div>
              <div>
                <b>{paused ? t.pausedQrTitle : t.scanTitle}</b>
                <p>{paused ? t.pausedQrBody : t.scanBody}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
