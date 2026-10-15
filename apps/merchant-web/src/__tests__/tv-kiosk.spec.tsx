/**
 * Smart TV 16:9 Caller — Phase 4.2 RED specs + branch-id route.
 */

import { act, render, screen, within } from '@testing-library/react';
import type { WsServerEvent } from '@luotdi/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { TvKioskPage } from '../modules/tv-kiosk';

/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';
const DISPLAY_A014 = `A${MIDDLE_DOT}014`;

const BRANCH_SLUG = 'pho-24-nguyen-hue';
const BRANCH_ID = 'branch-1';

const TV_SNAPSHOT = {
  branchId: BRANCH_ID,
  branchSlug: BRANCH_SLUG,
  branchName: 'Pho 24 — Nguyen Hue',
  walkInQrUrl: `https://luotdi.app/b/qr-${BRANCH_SLUG}`,
  buckets: [
    {
      id: 'bucket-a',
      prefix: 'A',
      labelVi: 'BÀN A',
      partiesWaiting: 3,
      estimatedWaitMins: 12,
    },
    {
      id: 'bucket-b',
      prefix: 'B',
      labelVi: 'BÀN B',
      partiesWaiting: 2,
      estimatedWaitMins: 20,
    },
    {
      id: 'bucket-c',
      prefix: 'C',
      labelVi: 'BÀN C',
      partiesWaiting: 1,
      estimatedWaitMins: 35,
    },
  ],
};

const queueSocket = vi.hoisted(() => {
  const listeners = new Set<(event: WsServerEvent) => void>();
  return {
    listeners,
    emit(event: WsServerEvent) {
      for (const listener of listeners) listener(event);
    },
    reset() {
      listeners.clear();
    },
  };
});

vi.mock('../hooks/useQueueSocket', () => ({
  useQueueSocket: vi.fn(
    (opts: { onEvent?: (event: WsServerEvent) => void } = {}) => {
      if (opts.onEvent) {
        queueSocket.listeners.add(opts.onEvent);
      }
      return { connected: true };
    },
  ),
}));

type MockUtterance = {
  text: string;
  lang: string;
};

function renderTvKiosk(path = `/tv/${BRANCH_SLUG}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tv/branch/:branchId" element={<TvKioskPage />} />
        <Route path="/tv/:branchSlug" element={<TvKioskPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetchSnapshot(
  overrides: Partial<typeof TV_SNAPSHOT> = {},
) {
  const payload = { ...TV_SNAPSHOT, ...overrides };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      method === 'GET' &&
      (url.includes(`/api/branches/slug/${BRANCH_SLUG}`) ||
        url.includes(`/api/tv/${BRANCH_SLUG}`) ||
        url.includes(`/api/branches/${BRANCH_SLUG}/tv`) ||
        url.includes(`/api/branches/${BRANCH_SLUG}/snapshot`))
    ) {
      return Response.json(payload);
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Smart TV — YOUR_TURN_CALLED summoning panel', () => {
  let fetchMock: Mock;
  let speakMock: Mock;
  let lastUtterance: MockUtterance | null;

  beforeEach(() => {
    queueSocket.reset();
    lastUtterance = null;
    speakMock = vi.fn((utterance: MockUtterance) => {
      lastUtterance = utterance;
    });

    class SpeechSynthesisUtteranceMock {
      text: string;
      lang = '';
      constructor(text: string) {
        this.text = text;
      }
    }

    vi.stubGlobal('SpeechSynthesisUtterance', SpeechSynthesisUtteranceMock);
    vi.stubGlobal('speechSynthesis', {
      speak: speakMock,
      cancel: vi.fn(),
      getVoices: () => [],
      pending: false,
      speaking: false,
      paused: false,
    });

    fetchMock = mockFetchSnapshot();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('flashes ticket on left 50% Đang mời when YOUR_TURN_CALLED arrives', async () => {
    renderTvKiosk();

    const layout = await screen.findByTestId('tv-kiosk-layout');
    expect(layout).toBeInTheDocument();

    const left = screen.getByTestId('tv-summoning-panel');
    expect(left).toBeInTheDocument();

    await act(async () => {
      queueSocket.emit({
        type: 'YOUR_TURN_CALLED',
        branchId: BRANCH_ID,
        ticketId: 'ticket-a014',
        displayNumber: DISPLAY_A014,
        at: Date.now(),
      });
    });

    expect(useQueueSocket).toHaveBeenCalled();
    expect(within(left).getByText(/Đang mời/i)).toBeInTheDocument();
    expect(within(left).getByText(DISPLAY_A014)).toBeInTheDocument();
    // Flash / highlight signal for the summoned ticket
    expect(left.className).toMatch(/signal-orange|flash|summoning/i);
  });

  it('invokes speechSynthesis with lang vi-VN for the summoned ticket', async () => {
    renderTvKiosk();
    await screen.findByTestId('tv-kiosk-layout');

    await act(async () => {
      queueSocket.emit({
        type: 'YOUR_TURN_CALLED',
        branchId: BRANCH_ID,
        ticketId: 'ticket-a014',
        displayNumber: DISPLAY_A014,
        at: Date.now(),
      });
    });

    expect(speakMock).toHaveBeenCalled();
    expect(lastUtterance).not.toBeNull();
    expect(lastUtterance!.lang).toBe('vi-VN');
    expect(lastUtterance!.text).toMatch(/Xin mời quý khách số A/i);
    expect(lastUtterance!.text).toMatch(/không một bốn/i);
    expect(lastUtterance!.text).toMatch(/vào bàn/i);
  });
});

describe('Smart TV — right panel bucket summary + walk-in QR', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    queueSocket.reset();
    fetchMock = mockFetchSnapshot();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders live bucket summary BÀN A/B/C without emoji on the right 50%', async () => {
    renderTvKiosk();

    const right = await screen.findByTestId('tv-sidebar-panel');
    const buckets = within(right).getByTestId('tv-bucket-summary');

    expect(within(buckets).getByText(/BÀN\s*A/i)).toBeInTheDocument();
    expect(within(buckets).getByText(/BÀN\s*B/i)).toBeInTheDocument();
    expect(within(buckets).getByText(/BÀN\s*C/i)).toBeInTheDocument();

    // Live waiting counts from snapshot
    expect(within(buckets).getByText('3')).toBeInTheDocument();
    expect(within(buckets).getByText('2')).toBeInTheDocument();
    expect(within(buckets).getByText('1')).toBeInTheDocument();

    // No emoji in bucket summary copy
    expect(buckets.textContent ?? '').not.toMatch(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u,
    );
  });

  it('renders a high-contrast static QR for walk-ins on the right 50%', async () => {
    renderTvKiosk();

    const right = await screen.findByTestId('tv-sidebar-panel');
    const qr = within(right).getByTestId('walk-in-qr');
    expect(qr).toBeInTheDocument();

    const target = qr.matches('[data-qr-url]')
      ? qr
      : qr.querySelector('[data-qr-url], img, svg, canvas');
    expect(target).not.toBeNull();
    expect(target!.getAttribute('data-qr-url')).toBe(TV_SNAPSHOT.walkInQrUrl);
  });
});

describe('Smart TV — /tv/branch/:branchId endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loads Phở 24 Quận 3 from branch-id TV URL, not slug LIMIT 1', async () => {
    const branchPhoD3 = 'branch-pho-d3';
    const payload = {
      branchId: branchPhoD3,
      branchSlug: 'pho-24',
      branchName: 'Phở 24 Quận 3',
      walkInQrUrl: 'https://luotdi.app/b/qr-pho-q3',
      buckets: TV_SNAPSHOT.buckets,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/api/branches/${branchPhoD3}/tv`)) {
        return Response.json(payload);
      }
      if (url.includes('/api/branches/slug/')) {
        return Response.json({
          ...TV_SNAPSHOT,
          branchName: 'Phở 24 Nguyễn Huệ',
        });
      }
      return Response.json({ error: 'not mocked', url }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('speechSynthesis', {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    renderTvKiosk(`/tv/branch/${branchPhoD3}`);

    expect(await screen.findByText('Phở 24 Quận 3')).toBeInTheDocument();
    expect(screen.queryByText(/Nguyễn Huệ/i)).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalled();
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(
      calledUrls.some((u) => u.includes(`/api/branches/${branchPhoD3}/tv`)),
    ).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/branches/slug/'))).toBe(
      false,
    );
  });
});
