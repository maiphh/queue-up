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

const identityMock = vi.hoisted(() => ({
  value: {
    status: 'ready' as 'ready' | 'loading' | 'error',
    ready: true,
    customerName: 'Test Guest',
    error: null as string | null,
    retry: () => {},
  },
}));

vi.mock('../hooks/useZaloIdentity', () => ({
  useZaloIdentity: vi.fn(() => identityMock.value),
}));

vi.mock('zmp-sdk', () => ({
  requestSendNotification: vi.fn(async () => undefined),
  followOA: vi.fn(async () => undefined),
  getRouteParams: () => ({}),
  getAccessToken: vi.fn(),
  nativeStorage: { getItem: () => '', setItem: () => undefined },
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

const ticketOverride = { value: {} as Record<string, unknown> };

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
      return Response.json({ ...TICKET_PAYLOAD, ...ticketOverride.value });
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

  it('renders branch header, party options 1 / 2 / 3–4 / 5+ mapped to Bàn A/B/C, and wait', async () => {
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);

    expect(
      await screen.findByRole('heading', { name: /Pho 24 — Nguyen Hue/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(guestCopy.partySize)).toBeInTheDocument();
    expect(screen.getByTestId('be-ve-idle')).toBeInTheDocument();

    const group = screen.getByRole('radiogroup', { name: guestCopy.partySize });
    const partyRadios = within(group).getAllByRole('radio');
    expect(partyRadios.map((r) => r.getAttribute('aria-label'))).toEqual(['1', '2', '3–4', '5+']);
    expect(partyRadios[1]).toHaveTextContent('Bàn A');
    expect(partyRadios[2]).toHaveTextContent('Bàn B');
    expect(partyRadios[3]).toHaveTextContent('Bàn C');

    await user.click(screen.getByRole('radio', { name: '2' }));
    expect(screen.getByTestId('matched-bucket')).toHaveTextContent(/^A$/);
    expect(screen.getAllByText(/~12 phút/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('radio', { name: '3–4' }));
    expect(screen.getByTestId('matched-bucket')).toHaveTextContent(/^B$/);

    await user.click(screen.getByRole('radio', { name: '5+' }));
    expect(screen.getByTestId('matched-bucket')).toHaveTextContent(/^C$/);
    expect(screen.getAllByText(/~35 phút/).length).toBeGreaterThan(0);

    // Zalo notify opt-in defaults on and can be toggled
    const sw = screen.getByRole('switch', { name: guestCopy.notifyMe });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
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
        customerName: 'Test Guest',
      }),
    );
    // Identity is never sent by the client (JWT Bearer only).
    expect(body).not.toHaveProperty('zaloUserId');

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

  afterEach(() => {
    ticketOverride.value = {};
  });

  it('waiting: huge A·014, Đang gọi / Phía trước / Chờ khoảng, 4-step progress', async () => {
    renderApp(`/ticket/${TICKET_ID}`);

    const readout = await screen.findByTestId('ticket-display-number');
    expect(readout).toHaveTextContent(DISPLAY_NUMBER);
    expect(screen.getByTestId('live-pass-chassis')).toHaveAttribute('data-phase', 'waiting');

    const metrics = screen.getByTestId('live-pass-metrics');
    expect(within(metrics).getByText(guestCopy.nowServing)).toBeInTheDocument();
    expect(within(metrics).getByText(guestCopy.ahead)).toBeInTheDocument();
    expect(within(metrics).getByText(guestCopy.estWait)).toBeInTheDocument();
    expect(within(metrics).getByText(`A${MIDDLE_DOT}011`)).toBeInTheDocument();
    expect(within(metrics).getByText('3')).toBeInTheDocument();
    expect(within(metrics).getByText('12')).toBeInTheDocument();
    expect(screen.getByText(guestCopy.turnsLeft(3))).toBeInTheDocument();
    expect(screen.getByTestId('steps').querySelectorAll('[data-state="done"]')).toHaveLength(1);
  });

  it('almost: green "Sắp đến lượt bạn!" banner with excited Bé Vé and "Mình đang đến"', async () => {
    ticketOverride.value = { partiesAhead: 1, estimatedWaitMins: 4 };
    const user = userEvent.setup();
    renderApp(`/ticket/${TICKET_ID}`);
    const banner = await screen.findByTestId('almost-banner');
    expect(banner).toHaveTextContent(guestCopy.almostTitle);
    expect(within(banner).getByTestId('be-ve-excited')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: guestCopy.onMyWay }));
    expect(screen.getByRole('button', { name: guestCopy.onMyWayAck })).toBeDisabled();
  });

  it('YOUR_TURN_CALLED turns the screen green with Bé Vé celebrating', async () => {
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
    expect(chassis).toHaveAttribute('data-phase', 'yourTurn');
    expect(screen.getByTestId('live-pass').className).toMatch(/d-green-screen/);
    expect(screen.getByText(guestCopy.yourTurnTitle)).toBeInTheDocument();
    expect(screen.getByText(guestCopy.proceedTo('Bàn A'))).toBeInTheDocument();
    expect(screen.getByTestId('be-ve-celebrate')).toBeInTheDocument();
  });

  it('CALLED shows the hold countdown from calledAt + grace', async () => {
    ticketOverride.value = { status: 'CALLED', calledAt: Date.now() - 60_000, graceMins: 5 };
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('hold-countdown')).toHaveTextContent(/0[34]:\d\d/);
  });

  it('HELD shows the late Bé Vé', async () => {
    ticketOverride.value = { status: 'HELD' };
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('late-banner')).toHaveTextContent(guestCopy.lateTitle);
    expect(screen.getByTestId('be-ve-late')).toBeInTheDocument();
  });

  it('paused queue shows sleeping Bé Vé', async () => {
    ticketOverride.value = { isPaused: true };
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('paused-banner')).toBeInTheDocument();
    expect(screen.getAllByTestId('be-ve-sleep').length).toBeGreaterThan(0);
  });

  it('served: thank-you Bé Vé, 1-tap rating and reason chips', async () => {
    ticketOverride.value = { status: 'SEATED' };
    const user = userEvent.setup();
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByText(guestCopy.thanksTitle(BRANCH_PAYLOAD.name))).toBeInTheDocument();
    expect(screen.getByTestId('be-ve-thanks')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: guestCopy.sendRating });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '5' }));
    await user.click(screen.getByRole('button', { name: 'Chờ nhanh' }));
    expect(screen.getByRole('button', { name: 'Chờ nhanh' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(send);
    expect(screen.getByRole('status')).toHaveTextContent(guestCopy.ratingThanks);
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
      await screen.findByRole('heading', { name: guestCopy.marketTitle }),
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
    expect(within(list).getAllByText(guestCopy.groupsWaitingShort).length).toBeGreaterThan(
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

describe('Lấy số button — regression for "cannot tap" in Zalo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    identityMock.value = { ...identityMock.value, status: 'ready', ready: true, error: null };
  });

  it('SERVICE_TYPE branch (clinic) is tappable: sends bucketId instead of pax', async () => {
    const clinic = {
      ...BRANCH_PAYLOAD,
      routingMode: 'SERVICE_TYPE',
      buckets: [
        { id: 'bucket-gen', prefix: 'G', labelVi: 'KHÁM TỔNG QUÁT', minPax: 1, maxPax: 1, partiesWaiting: 0, estimatedWaitMins: 5 },
        { id: 'bucket-lab', prefix: 'L', labelVi: 'XÉT NGHIỆM', minPax: 1, maxPax: 1, partiesWaiting: 0, estimatedWaitMins: 8 },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'POST') return Response.json({ id: TICKET_ID });
      if (url.includes('/api/branches/by-qr/')) return Response.json(clinic);
      return Response.json(TICKET_PAYLOAD);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);
    await screen.findByRole('heading', { name: /Pho 24/ });

    const btn = screen.getByRole('button', { name: guestCopy.issuePass });
    expect(btn).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'XÉT NGHIỆM' }));
    await user.click(btn);
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ bucketId: 'bucket-lab' });
    });
  });

  it('party size with no bucket explains why instead of a silent dead button', async () => {
    const cafe = { ...BRANCH_PAYLOAD, buckets: BRANCH_PAYLOAD.buckets.slice(0, 2) };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(cafe)));
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);
    await screen.findByRole('heading', { name: /Pho 24/ });
    await user.click(screen.getByRole('radio', { name: '5+' }));
    expect(screen.getByTestId('no-bucket')).toHaveTextContent(guestCopy.noBucketForParty);
    expect(screen.getByRole('button', { name: guestCopy.issuePass })).toBeDisabled();
  });

  it('identity failure shows the error and a retry instead of a forever-disabled button', async () => {
    const retry = vi.fn();
    identityMock.value = { status: 'error', ready: false, customerName: 'Khách', error: 'x', retry };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(BRANCH_PAYLOAD)));
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);
    await screen.findByRole('heading', { name: /Pho 24/ });
    expect(screen.getByTestId('identity-error')).toHaveTextContent('x');
    await user.click(screen.getByRole('button', { name: guestCopy.retry }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Round 4 · G2/G3 states', () => {
  afterEach(() => { vi.unstubAllGlobals(); ticketOverride.value = {}; });

  it('paused branch: sleeping Bé Vé, Lấy số disabled, link to other branches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...BRANCH_PAYLOAD, isPaused: true })));
    renderApp(`/b/${QR_TOKEN}`);
    expect(await screen.findByTestId('join-paused')).toHaveTextContent(guestCopy.pausedTitle);
    expect(screen.getByRole('button', { name: guestCopy.issuePass })).toBeDisabled();
    expect(screen.getByRole('button', { name: guestCopy.otherNearby })).toBeInTheDocument();
  });

  it('404 QR shows the not-found screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'BRANCH_NOT_FOUND' }, { status: 404 })));
    renderApp(`/b/${QR_TOKEN}`);
    expect(await screen.findByText(guestCopy.notFoundTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: guestCopy.findNearby })).toBeInTheDocument();
  });

  it('duplicate ticket pins the existing number and links to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ code: 'ACTIVE_TICKET_EXISTS', activeTicket: { id: TICKET_ID, displayNumber: 'A·009' } }, { status: 409 })
        : Response.json(BRANCH_PAYLOAD)));
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);
    await screen.findByRole('heading', { name: /Pho 24/ });
    await user.click(screen.getByRole('button', { name: guestCopy.issuePass }));
    expect(await screen.findByTestId('dupe-ticket')).toBeInTheDocument();
    expect(screen.getByText('A·009')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: guestCopy.viewMyTicket })).toBeInTheDocument();
  });

  it('cancelled ticket is struck through with Lấy số mới', async () => {
    vi.stubGlobal('fetch', mockFetchRouter());
    ticketOverride.value = { status: 'CANCELLED' };
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('ticket-cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: guestCopy.newTicket })).toBeInTheDocument();
  });

  it('paused ticket shows Đang giữ lượt and a dash for wait', async () => {
    vi.stubGlobal('fetch', mockFetchRouter());
    ticketOverride.value = { isPaused: true };
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('chip-holding')).toHaveTextContent(guestCopy.holdingTurn);
    expect(screen.getByTestId('wait-paused')).toHaveTextContent('—');
  });

  it('late ticket offers Mình đang đến and cancel, which POSTs /cancel', async () => {
    const f = mockFetchRouter();
    f.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/cancel')) return Response.json({ id: TICKET_ID, status: 'CANCELLED' });
      return Response.json({ ...TICKET_PAYLOAD, status: 'HELD', calledAt: Date.now() - 60_000, graceMins: 5, ...(init ? {} : {}) });
    });
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('chip-called')).toBeInTheDocument();
    expect(screen.getByTestId('late-hold')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: guestCopy.notComing }));
    expect(await screen.findByTestId('ticket-cancelled')).toBeInTheDocument();
  });
});

describe('Round 4 · G1 marketplace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pins the active ticket, shows paused + wait chips, and an empty search state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      branches: [
        { id: 'b1', name: 'Quán Một', category: 'RESTAURANT', waitingCount: 3, district: 'Q1', estimatedWaitMins: 12, isPaused: false },
        { id: 'b2', name: 'Quán Hai', category: 'CAFE', waitingCount: 0, district: 'Q3', estimatedWaitMins: null, isPaused: true },
      ],
      activeTicket: { id: TICKET_ID, displayNumber: 'A·014', status: 'WAITING', branchId: 'b1', branchName: 'Quán Một', partiesAhead: 2 },
      located: false,
    })));
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByTestId('active-ticket')).toHaveTextContent('A·014');
    expect(within(screen.getByTestId('market-b1')).getByText(`~12 ${guestCopy.minutes}`)).toBeInTheDocument();
    expect(within(screen.getByTestId('market-b2')).getByText(guestCopy.paused)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByTestId('market-empty')).toBeInTheDocument();
  });

  it('shows the error state with retry when the list fails', async () => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    renderApp('/');
    expect(await screen.findByTestId('market-error')).toBeInTheDocument();
  });
});

describe('Owner-only ticket read', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    identityMock.value = { ...identityMock.value, status: 'ready', ready: true, error: null };
  });

  it('waits for the guest JWT before GET /api/tickets/:id', async () => {
    identityMock.value = { ...identityMock.value, status: 'loading', ready: false, error: null };
    const f = mockFetchRouter();
    vi.stubGlobal('fetch', f);
    renderApp(`/ticket/${TICKET_ID}`);
    await new Promise((r) => setTimeout(r, 50));
    expect(f.mock.calls.some(([u]) => String(u).includes(`/api/tickets/${TICKET_ID}`))).toBe(false);
  });

  it('shows sign-in failure with retry instead of a forever spinner', async () => {
    const retry = vi.fn();
    identityMock.value = { status: 'error', ready: false, customerName: 'Khách', error: 'x', retry };
    vi.stubGlobal('fetch', mockFetchRouter());
    const user = userEvent.setup();
    renderApp(`/ticket/${TICKET_ID}`);
    expect(await screen.findByTestId('identity-error')).toHaveTextContent('x');
    await user.click(screen.getByRole('button', { name: guestCopy.retry }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Lấy số — each failure has its own message', () => {
  afterEach(() => vi.unstubAllGlobals());

  const cases: [string, () => Promise<Response>, string][] = [
    ['409 ACTIVE_TICKET_EXISTS', async () => Response.json({ code: 'ACTIVE_TICKET_EXISTS' }, { status: 409 }), guestCopy.ticketErrors.ACTIVE_TICKET_EXISTS!],
    ['423 QUEUE_PAUSED', async () => Response.json({ code: 'QUEUE_PAUSED' }, { status: 423 }), guestCopy.ticketErrors.QUEUE_PAUSED!],
    ['402 FREE_QUOTA_EXCEEDED', async () => Response.json({ code: 'FREE_QUOTA_EXCEEDED' }, { status: 402 }), guestCopy.ticketErrors.FREE_QUOTA_EXCEEDED!],
    ['401 session', async () => Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }), guestCopy.ticketErrors.UNAUTHORIZED!],
    ['500 unknown', async () => new Response('oops', { status: 500 }), guestCopy.ticketErrors.UNKNOWN!],
    ['network', async () => { throw new TypeError('Failed to fetch'); }, guestCopy.ticketErrors.NETWORK!],
  ];

  it.each(cases)('%s', async (_label, post, message) => {
    vi.stubGlobal('fetch', vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
      (init?.method === 'POST' ? post() : Response.json(BRANCH_PAYLOAD))));
    const user = userEvent.setup();
    renderApp(`/b/${QR_TOKEN}`);
    await screen.findByRole('heading', { name: /Pho 24/ });
    await user.click(screen.getByRole('button', { name: guestCopy.issuePass }));
    expect(await screen.findByTestId('issue-error')).toHaveTextContent(message);
  });

  it('messages are all distinct', () => {
    const vals = Object.values(guestCopy.ticketErrors);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
