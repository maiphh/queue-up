/**
 * Host POS Console — Phase 4.1 RED specs.
 * GREEN (AGENT-FRONTEND): implement HostPosPage so these pass.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { HostPosPage } from '../modules/host-pos';

/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';
const DISPLAY_A014 = `A${MIDDLE_DOT}014`;
const DISPLAY_A015 = `A${MIDDLE_DOT}015`;
const DISPLAY_B003 = `B${MIDDLE_DOT}003`;

const BRANCH_ID = 'branch-1';

type HostTicket = {
  id: string;
  displayNumber: string;
  status: 'WAITING' | 'CALLED' | 'HELD' | 'SEATED' | 'CANCELLED';
  bucketId: string;
  paxCount: number;
  customerName: string;
  priorityBoost: number;
  createdAt: number;
  calledAt: number | null;
};

const WAITING_TICKETS: HostTicket[] = [
  {
    id: 'ticket-a014',
    displayNumber: DISPLAY_A014,
    status: 'WAITING',
    bucketId: 'bucket-a',
    paxCount: 2,
    customerName: 'Nguyen Van A',
    priorityBoost: 0,
    createdAt: 1_700_000_000_000,
    calledAt: null,
  },
  {
    id: 'ticket-a015',
    displayNumber: DISPLAY_A015,
    status: 'WAITING',
    bucketId: 'bucket-a',
    paxCount: 1,
    customerName: 'Tran Thi B',
    priorityBoost: 0,
    createdAt: 1_700_000_060_000,
    calledAt: null,
  },
];

const CALLED_TICKET: HostTicket = {
  id: 'ticket-b003',
  displayNumber: DISPLAY_B003,
  status: 'CALLED',
  bucketId: 'bucket-b',
  paxCount: 4,
  customerName: 'Le Van C',
  priorityBoost: 0,
  createdAt: 1_699_999_900_000,
  calledAt: 1_700_000_120_000,
};

const SNAPSHOT_BASE = {
  branchId: BRANCH_ID,
  branchName: 'Pho 24 — Nguyen Hue',
  waitingCount: 2,
  avgWaitMins: 14,
  queueStatus: 'OPEN' as const,
  isPaused: false,
  tickets: [] as HostTicket[],
};

function renderHostPos(path = `/host/${BRANCH_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/host/:branchId" element={<HostPosPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetchSnapshot(overrides: Partial<typeof SNAPSHOT_BASE> = {}) {
  const payload = { ...SNAPSHOT_BASE, ...overrides };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      method === 'GET' &&
      (url.includes(`/api/branches/${BRANCH_ID}/snapshot`) ||
        url.includes(`/api/host/branches/${BRANCH_ID}`) ||
        url.includes(`/api/host/${BRANCH_ID}/queue`))
    ) {
      return Response.json(payload);
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Host POS — top bar', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockFetchSnapshot({
      tickets: [...WAITING_TICKETS],
      waitingCount: 2,
      avgWaitMins: 14,
      queueStatus: 'OPEN',
      isPaused: false,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('displays live metrics WAITING, AVG WAIT, QUEUE STATUS plus PAUSE QUEUE and + WALK-IN', async () => {
    renderHostPos();

    const topBar = await screen.findByTestId('host-pos-top-bar');

    const metrics = within(topBar).getByTestId('host-pos-metrics');
    expect(within(metrics).getByText(/WAITING/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/AVG\s*WAIT/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/QUEUE\s*STATUS/i)).toBeInTheDocument();

    expect(within(metrics).getByText('2')).toBeInTheDocument();
    expect(within(metrics).getByText(/14\s*min/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/OPEN/i)).toBeInTheDocument();

    expect(
      within(topBar).getByRole('button', { name: /PAUSE\s*QUEUE/i }),
    ).toBeInTheDocument();
    expect(
      within(topBar).getByRole('button', { name: /\+\s*WALK-IN/i }),
    ).toBeInTheDocument();
  });

  it('PAUSE QUEUE toggles and + WALK-IN opens the walk-in modal', async () => {
    const user = userEvent.setup();
    renderHostPos();

    const topBar = await screen.findByTestId('host-pos-top-bar');
    const pauseBtn = within(topBar).getByRole('button', {
      name: /PAUSE\s*QUEUE/i,
    });
    await user.click(pauseBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/(host\/)?branches\/[^/]+\/(pause|queue)|\/api\/host\/[^/]+\/pause/,
        ),
        expect.objectContaining({
          method: expect.stringMatching(/POST|PATCH|PUT/i),
        }),
      );
    });

    await user.click(
      within(topBar).getByRole('button', { name: /\+\s*WALK-IN/i }),
    );
    expect(await screen.findByTestId('walk-in-modal')).toBeInTheDocument();
  });
});

describe('Host POS — pinned summoned strip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is hidden when no CALLED tickets', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSnapshot({
        tickets: [...WAITING_TICKETS],
        waitingCount: 2,
      }),
    );
    renderHostPos();

    await screen.findByTestId('host-pos-top-bar');
    expect(screen.queryByTestId('summoned-strip')).not.toBeInTheDocument();
  });

  it('appears with SEAT GUEST and HOLD 10M when >=1 CALLED ticket', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSnapshot({
        tickets: [CALLED_TICKET, ...WAITING_TICKETS],
        waitingCount: 2,
      }),
    );
    renderHostPos();

    const strip = await screen.findByTestId('summoned-strip');
    expect(within(strip).getByText(DISPLAY_B003)).toBeInTheDocument();
    expect(
      within(strip).getByRole('button', { name: /SEAT\s*GUEST/i }),
    ).toBeInTheDocument();
    expect(
      within(strip).getByRole('button', { name: /HOLD\s*10M/i }),
    ).toBeInTheDocument();
  });
});

describe('Host POS — waiting ledger', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockFetchSnapshot({
      tickets: [...WAITING_TICKETS],
      waitingCount: 2,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a single primary SUMMON button per waiting row', async () => {
    renderHostPos();

    const ledger = await screen.findByTestId('waiting-ledger');
    const rows = within(ledger).getAllByTestId(/^waiting-row-/);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const summonButtons = within(row).getAllByRole('button', {
        name: /^SUMMON$/i,
      });
      expect(summonButtons).toHaveLength(1);
      // Progressive disclosure: no Seat / Hold / Cancel as primary row actions
      expect(
        within(row).queryByRole('button', { name: /SEAT\s*GUEST/i }),
      ).not.toBeInTheDocument();
      expect(
        within(row).queryByRole('button', { name: /HOLD\s*10M/i }),
      ).not.toBeInTheDocument();
      expect(
        within(row).queryByRole('button', { name: /^Cancel$/i }),
      ).not.toBeInTheDocument();
    }

    expect(within(ledger).getByText(DISPLAY_A014)).toBeInTheDocument();
    expect(within(ledger).getByText(DISPLAY_A015)).toBeInTheDocument();
  });

  it('keeps Bump Priority, Change Party Size, Cancel inside MORE row action drawer', async () => {
    const user = userEvent.setup();
    renderHostPos();

    const ledger = await screen.findByTestId('waiting-ledger');
    const row = within(ledger).getByTestId('waiting-row-ticket-a014');

    // Geometric label — MORE or ... (no emoji)
    const moreBtn = within(row).getByRole('button', {
      name: /^(MORE|\.\.\.)$/i,
    });
    expect(moreBtn).toBeInTheDocument();

    expect(
      within(row).queryByRole('button', { name: /Bump\s*Priority/i }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Change\s*Party\s*Size/i }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /^Cancel$/i }),
    ).not.toBeInTheDocument();

    await user.click(moreBtn);

    const drawer = await screen.findByTestId('row-action-drawer');
    expect(
      within(drawer).getByRole('button', { name: /Bump\s*Priority/i }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: /Change\s*Party\s*Size/i }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: /^Cancel$/i }),
    ).toBeInTheDocument();
  });
});
