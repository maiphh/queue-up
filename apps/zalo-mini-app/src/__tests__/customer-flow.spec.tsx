/**
 * Customer Zalo Mini App screens — Phase 3.2 RED specs.
 * GREEN (AGENT-FRONTEND): implement pages + hooks so these pass.
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WsServerEvent } from '@luotdi/shared';
import { guestCopy } from '@luotdi/shared';
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
import {
  BranchCheckInPage,
  LivePassPage,
  MarketplacePage,
} from '../pages';

/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';
const DISPLAY_NUMBER = `A${MIDDLE_DOT}014`;

const QR_TOKEN = 'qr-pho24-nguyen-hue';
const BRANCH_ID = 'branch-1';
const TICKET_ID = 'ticket-a014';

const BRANCH_PAYLOAD = {
  id: BRANCH_ID,
  name: 'Pho 24 — Nguyen Hue',
  district: 'Quan 1',
  city: 'Ho Chi Minh',
  routingMode: 'PARTY_SIZE' as const,
  category: 'RESTAURANT' as const,
  buckets: [
    {
      id: 'bucket-a',
      prefix: 'A',
      minPax: 1,
      maxPax: 2,
      partiesWaiting: 3,
      estimatedWaitMins: 12,
    },
    {
      id: 'bucket-b',
      prefix: 'B',
      minPax: 3,
      maxPax: 4,
      partiesWaiting: 2,
      estimatedWaitMins: 20,
    },
    {
      id: 'bucket-c',
      prefix: 'C',
      minPax: 5,
      maxPax: 12,
      partiesWaiting: 1,
      estimatedWaitMins: 35,
    },
  ],
};

const TICKET_PAYLOAD = {
  id: TICKET_ID,
  displayNumber: DISPLAY_NUMBER,
  status: 'WAITING' as const,
  branchId: BRANCH_ID,
  branchName: BRANCH_PAYLOAD.name,
  bucketId: 'bucket-a',
  paxCount: 2,
  nowServing: `A${MIDDLE_DOT}011`,
  partiesAhead: 3,
  estimatedWaitMins: 12,
};

const MARKETPLACE_BRANCHES = [
  {
    id: 'branch-1',
    name: 'Pho 24 — Nguyen Hue',
    category: 'RESTAURANT',
    waitingCount: 6,
    district: 'Quan 1',
  },
  {
    id: 'branch-2',
    name: 'District Clinic',
    category: 'CLINIC',
    waitingCount: 4,
    district: 'Quan 3',
  },
  {
    id: 'branch-3',
    name: 'The Coffee House',
    category: 'CAFE',
    waitingCount: 2,
    district: 'Quan 1',
  },
];

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

vi.mock('../hooks/useZaloIdentity', () => ({
  useZaloIdentity: vi.fn(() => ({
    zaloUserId: 'zalo-user-test-1',
    customerName: 'Test Guest',
    ready: true,
  })),
}));

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

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<MarketplacePage />} />
        <Route path="/b/:qrToken" element={<BranchCheckInPage />} />
        <Route path="/ticket/:ticketId" element={<LivePassPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetchRouter() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      method === 'GET' &&
      (url.includes(`/api/branches/by-qr/${QR_TOKEN}`) ||
        url.includes(`qr_token=${QR_TOKEN}`) ||
        url.includes(`/api/branches/qr/${QR_TOKEN}`))
    ) {
      return Response.json(BRANCH_PAYLOAD);
    }

    if (method === 'GET' && url.includes(`/api/tickets/${TICKET_ID}`)) {
      return Response.json(TICKET_PAYLOAD);
    }

    if (
      method === 'GET' &&
      (url.endsWith('/api/branches') ||
        url.includes('/api/branches?') ||
        url.includes('/api/marketplace'))
    ) {
      return Response.json({ branches: MARKETPLACE_BRANCHES });
    }

    if (method === 'POST' && url.includes('/api/tickets')) {
      return Response.json(
        {
          id: TICKET_ID,
          displayNumber: DISPLAY_NUMBER,
          status: 'WAITING',
          bucketId: 'bucket-a',
          seqNumber: 14,
          estimatedWaitMins: 12,
        },
        { status: 201 },
      );
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Customer flow — QR deep-link check-in', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    queueSocket.reset();
    fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders branch header, party size matrix (1–8+), matching bucket and wait estimate', async () => {
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);

    expect(
      await screen.findByRole('heading', { name: /Pho 24 — Nguyen Hue/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(guestCopy.partySize)).toBeInTheDocument();
    expect(screen.queryByText(/SELECT PARTY SIZE/i)).not.toBeInTheDocument();

    const partyRadios = screen.getAllByRole('radio');
    expect(partyRadios).toHaveLength(8);
    expect(partyRadios[0]).toHaveTextContent('1');
    expect(partyRadios[7]).toHaveTextContent('8+');

    // Party size 2 → Bucket A (1–2), live wait from branch snapshot
    await user.click(screen.getByRole('radio', { name: '2' }));
    const matchedBucket = screen.getByTestId('matched-bucket');
    expect(matchedBucket).toHaveTextContent(/^A$/);
    expect(matchedBucket).toHaveAttribute('data-active', 'true');
    expect(screen.getByText(/12\s*min/i)).toBeInTheDocument();

    // Party size 4 → Bucket B
    await user.click(screen.getByRole('radio', { name: '4' }));
    expect(screen.getByTestId('matched-bucket')).toHaveTextContent(/^B$/);
    expect(screen.getByText(/20\s*min/i)).toBeInTheDocument();

    // Party size 8+ → Bucket C
    await user.click(screen.getByRole('radio', { name: '8+' }));
    expect(screen.getByTestId('matched-bucket')).toHaveTextContent(/^C$/);
    expect(screen.getByText(/35\s*min/i)).toBeInTheDocument();
  });
});

describe('Customer flow — 1-tap issue pass', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    queueSocket.reset();
    fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('clicking Lấy số POSTs /api/tickets and navigates to /ticket/:id', async () => {
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);

    await screen.findByRole('heading', { name: /Pho 24 — Nguyen Hue/i });
    await user.click(screen.getByRole('radio', { name: '2' }));
    await user.click(
      screen.getByRole('button', { name: guestCopy.issuePass }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tickets\/?$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': expect.stringContaining('application/json'),
          }),
        }),
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/tickets') &&
        String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() ===
          'POST',
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(body).toEqual(
      expect.objectContaining({
        branchId: BRANCH_ID,
        paxCount: 2,
        zaloUserId: 'zalo-user-test-1',
        customerName: 'Test Guest',
      }),
    );

    expect(
      await screen.findByText(DISPLAY_NUMBER, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('live-pass')).toBeInTheDocument();
  });
});

describe('Customer flow — live pass screen', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    queueSocket.reset();
    fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows giant A·014 readout and Đang gọi / Phía trước / Chờ khoảng strip', async () => {
    renderApp(`/ticket/${TICKET_ID}`);

    const readout = await screen.findByTestId('ticket-display-number');
    expect(readout).toHaveTextContent(DISPLAY_NUMBER);

    const metrics = screen.getByTestId('live-pass-metrics');
    expect(within(metrics).getByText(guestCopy.nowServing)).toBeInTheDocument();
    expect(within(metrics).getByText(guestCopy.ahead)).toBeInTheDocument();
    expect(within(metrics).getByText(guestCopy.estWait)).toBeInTheDocument();
    expect(within(metrics).getByText(`A${MIDDLE_DOT}011`)).toBeInTheDocument();
    expect(within(metrics).getByText('3')).toBeInTheDocument();
    expect(within(metrics).getByText(/12\s*min/i)).toBeInTheDocument();
  });

  it('YOUR_TURN_CALLED flips chassis to signal-orange with Mời vào quầy', async () => {
    renderApp(`/ticket/${TICKET_ID}`);
    await screen.findByTestId('ticket-display-number');

    expect(useQueueSocket).toHaveBeenCalled();

    await act(async () => {
      queueSocket.emit({
        type: 'YOUR_TURN_CALLED',
        branchId: BRANCH_ID,
        ticketId: TICKET_ID,
        displayNumber: DISPLAY_NUMBER,
        at: Date.now(),
      });
    });

    const chassis = await screen.findByTestId('live-pass-chassis');
    expect(chassis.className).toMatch(/bg-signal-orange/);
    expect(screen.getByText(guestCopy.proceed)).toBeInTheDocument();
    expect(screen.queryByText(/PROCEED TO HOST STAND/i)).not.toBeInTheDocument();
  });
});

describe('Customer flow — marketplace discovery', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    queueSocket.reset();
    fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('lists nearby branches with live waiting counts', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: guestCopy.marketplaceTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Marketplace/i)).not.toBeInTheDocument();

    expect(
      await screen.findByText(/Pho 24 — Nguyen Hue/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/District Clinic/i)).toBeInTheDocument();
    expect(screen.getByText(/The Coffee House/i)).toBeInTheDocument();

    const list = screen.getByTestId('marketplace-branch-list');
    expect(within(list).getByText('6')).toBeInTheDocument();
    expect(within(list).getByText('4')).toBeInTheDocument();
    expect(within(list).getByText('2')).toBeInTheDocument();
    expect(within(list).getAllByText(guestCopy.waiting).length).toBeGreaterThan(
      0,
    );
  });

  it('filters by category Tất cả / Quán ăn / Phòng khám / Cà phê', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByTestId('marketplace-branch-list');

    for (const label of [
      guestCopy.filterAll,
      guestCopy.filterRestaurant,
      guestCopy.filterClinic,
      guestCopy.filterCafe,
    ] as const) {
      expect(
        screen.getByRole('button', { name: label }),
      ).toBeInTheDocument();
    }

    await user.click(
      screen.getByRole('button', { name: guestCopy.filterRestaurant }),
    );
    const list = screen.getByTestId('marketplace-branch-list');
    expect(within(list).getByText(/Pho 24 — Nguyen Hue/i)).toBeInTheDocument();
    expect(within(list).queryByText(/District Clinic/i)).not.toBeInTheDocument();
    expect(
      within(list).queryByText(/The Coffee House/i),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: guestCopy.filterClinic }),
    );
    expect(within(list).getByText(/District Clinic/i)).toBeInTheDocument();
    expect(
      within(list).queryByText(/Pho 24 — Nguyen Hue/i),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: guestCopy.filterCafe }),
    );
    expect(within(list).getByText(/The Coffee House/i)).toBeInTheDocument();
    expect(within(list).queryByText(/District Clinic/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: guestCopy.filterAll }),
    );
    expect(within(list).getByText(/Pho 24 — Nguyen Hue/i)).toBeInTheDocument();
    expect(within(list).getByText(/District Clinic/i)).toBeInTheDocument();
    expect(within(list).getByText(/The Coffee House/i)).toBeInTheDocument();
  });
});
