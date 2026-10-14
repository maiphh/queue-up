/**
 * Smart TV 16:9 Caller — `/tv/:branchSlug`.
 * Left: NOW SUMMONING + vi-VN TTS. Right: bucket summary + walk-in QR.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { WsServerEvent } from '@luotdi/shared';
import {
  BraunChassis,
  GridCell,
  TabularMetric,
} from '@luotdi/ui-braun';
import { useQueueSocket } from '../../hooks/useQueueSocket';

type TvBucket = {
  id: string;
  prefix: string;
  labelVi: string;
  partiesWaiting: number;
  estimatedWaitMins: number;
};

type TvSnapshot = {
  branchId: string;
  branchSlug: string;
  branchName: string;
  walkInQrUrl: string;
  buckets: TvBucket[];
};

const VI_DIGIT: Record<string, string> = {
  '0': 'không',
  '1': 'một',
  '2': 'hai',
  '3': 'ba',
  '4': 'bốn',
  '5': 'năm',
  '6': 'sáu',
  '7': 'bảy',
  '8': 'tám',
  '9': 'chín',
};

/** Build vi-VN summon phrase from displayNumber e.g. A·014 */
export function buildViSummonSpeech(displayNumber: string): string {
  const cleaned = displayNumber.replace(/\u00B7/g, '').trim();
  const prefix = cleaned.charAt(0);
  const digits = cleaned.slice(1).replace(/\D/g, '');
  const spokenDigits = [...digits]
    .map((d) => VI_DIGIT[d] ?? d)
    .join(' ');
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

export function TvKioskPage() {
  const { branchSlug } = useParams<{ branchSlug: string }>();
  const [snapshot, setSnapshot] = useState<TvSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!branchSlug) return;
    try {
      const res = await fetch(`/api/branches/slug/${branchSlug}`);
      if (!res.ok) {
        setError('Failed to load TV snapshot');
        return;
      }
      const data = (await res.json()) as TvSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError('Failed to load TV snapshot');
    }
  }, [branchSlug]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // Optional screen wake-lock so the TV never sleeps
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    };

    void (async () => {
      try {
        if (nav.wakeLock?.request) {
          sentinel = await nav.wakeLock.request('screen');
        }
      } catch {
        /* wake-lock optional */
      }
    })();

    return () => {
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  const onEvent = useCallback((event: WsServerEvent) => {
    if (event.type === 'YOUR_TURN_CALLED') {
      setSummoning(event.displayNumber);
      speakViSummon(event.displayNumber);
    }
  }, []);

  useQueueSocket({
    branchId: snapshot?.branchId,
    role: 'TV',
    onEvent,
  });

  if (!branchSlug) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">Missing branch</p>
      </BraunChassis>
    );
  }

  if (error && !snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-xs text-graphite tabular">LOADING</p>
      </BraunChassis>
    );
  }

  const isSummoning = summoning !== null;

  return (
    <div
      data-page="tv-kiosk"
      data-testid="tv-kiosk-layout"
      className="flex min-h-screen w-full aspect-video flex-row bg-chassis text-carbon"
    >
      <section
        data-testid="tv-summoning-panel"
        className={
          isSummoning
            ? 'flex w-1/2 flex-col justify-center border-r border-grid bg-signal-orange p-8 text-panel tv-summoning-flash'
            : 'flex w-1/2 flex-col justify-center border-r border-grid bg-ink p-8 text-panel'
        }
      >
        <p className="font-mono text-xs uppercase tracking-widest tabular opacity-80">
          {snapshot.branchName}
        </p>
        <p className="mt-4 font-mono text-sm uppercase tracking-widest tabular">
          NOW SUMMONING
        </p>
        <div className="mt-6">
          <TabularMetric
            size="display"
            value={summoning ?? '—'}
            className="text-panel text-7xl"
          />
        </div>
      </section>

      <aside
        data-testid="tv-sidebar-panel"
        className="flex w-1/2 flex-col gap-6 bg-panel p-6"
      >
        <div data-testid="tv-bucket-summary" className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            BUCKET SUMMARY
          </p>
          <ul className="flex flex-col gap-2">
            {snapshot.buckets.map((bucket) => (
              <li
                key={bucket.id}
                className="flex items-center justify-between border border-grid bg-chassis px-3 py-2"
              >
                <GridCell label={bucket.labelVi} className="min-w-[96px]">
                  <TabularMetric
                    size="lg"
                    value={String(bucket.partiesWaiting)}
                  />
                </GridCell>
                <span className="font-mono text-xs text-graphite tabular">
                  {bucket.estimatedWaitMins} min
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          data-testid="walk-in-qr"
          className="mt-auto flex flex-col items-center gap-2 border border-grid bg-ink p-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-panel/70 tabular">
            WALK-IN QR
          </p>
          <svg
            data-qr-url={snapshot.walkInQrUrl}
            role="img"
            aria-label={`Walk-in QR ${snapshot.walkInQrUrl}`}
            viewBox="0 0 33 33"
            className="h-40 w-40 bg-panel text-ink"
            shapeRendering="crispEdges"
          >
            <rect width="33" height="33" fill="#F4F3EF" />
            {/* High-contrast finder-ish blocks — static stand-in for a QR lib */}
            <rect x="2" y="2" width="7" height="7" fill="#111111" />
            <rect x="24" y="2" width="7" height="7" fill="#111111" />
            <rect x="2" y="24" width="7" height="7" fill="#111111" />
            <rect x="4" y="4" width="3" height="3" fill="#F4F3EF" />
            <rect x="26" y="4" width="3" height="3" fill="#F4F3EF" />
            <rect x="4" y="26" width="3" height="3" fill="#F4F3EF" />
            <rect x="5" y="5" width="1" height="1" fill="#111111" />
            <rect x="27" y="5" width="1" height="1" fill="#111111" />
            <rect x="5" y="27" width="1" height="1" fill="#111111" />
            <rect x="12" y="4" width="2" height="2" fill="#111111" />
            <rect x="16" y="6" width="2" height="2" fill="#111111" />
            <rect x="20" y="4" width="1" height="3" fill="#111111" />
            <rect x="12" y="12" width="9" height="9" fill="#111111" />
            <rect x="14" y="14" width="5" height="5" fill="#F4F3EF" />
            <rect x="16" y="16" width="1" height="1" fill="#111111" />
            <rect x="12" y="24" width="2" height="2" fill="#111111" />
            <rect x="18" y="26" width="3" height="1" fill="#111111" />
            <rect x="24" y="12" width="2" height="3" fill="#111111" />
            <rect x="27" y="18" width="2" height="2" fill="#111111" />
          </svg>
        </div>
      </aside>
    </div>
  );
}
