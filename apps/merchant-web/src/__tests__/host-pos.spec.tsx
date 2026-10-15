/**
 * Host POS / Manager floor — Vietnamese accessible names + floor behavior.
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
import { managerCopy } from '@luotdi/shared';
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

    if (
      method === 'POST' &&
      (url.includes(`/api/branches/${BRANCH_ID}/pause`) ||
        url.includes(`/api/host/branches/${BRANCH_ID}/pause`) ||
        url.includes(`/api/host/${BRANCH_ID}/pause`))
    ) {
      return Response.json({
        branchId: BRANCH_ID,
        isPaused: true,
        queueStatus: 'PAUSED',
      });
    }

    if (method === 'POST' && url.includes('/api/tickets')) {
      return Response.json({
        id: 'ticket-walk-in',
        displayNumber: `W${MIDDLE_DOT}001`,
        status: 'WAITING',
        bucketId: 'bucket-a',
        seqNumber: 1,
      });
    }

    if (method === 'PATCH' && url.includes('/api/host/tickets/')) {
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Host POS — top bar', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    sessionStorage.clear();
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
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('displays live metrics Đang chờ, Chờ trung bình, Trạng thái plus Tạm dừng and Khách đến quầy', async () => {
    renderHostPos();

    const topBar = await screen.findByTestId('host-pos-top-bar');

    expect(within(topBar).getByText(managerCopy.eyebrow)).toBeInTheDocument();
    expect(
      within(topBar).getByRole('heading', { name: SNAPSHOT_BASE.branchName }),
    ).toBeInTheDocument();

    const metrics = within(topBar).getByTestId('host-pos-metrics');
    expect(
      within(metrics).getByText(managerCopy.metricWaiting),
    ).toBeInTheDocument();
    expect(
      within(metrics).getByText(managerCopy.metricAvgWait),
    ).toBeInTheDocument();
    expect(
      within(metrics).getByText(managerCopy.metricStatus),
    ).toBeInTheDocument();

    expect(within(metrics).getByText('2')).toBeInTheDocument();
    expect(within(metrics).getByText(/14\s*min/i)).toBeInTheDocument();
    expect(
      within(metrics).getByText(managerCopy.statusOpen),
    ).toBeInTheDocument();

    expect(
      within(topBar).getByRole('button', { name: managerCopy.pause }),
    ).toBeInTheDocument();
    expect(
      within(topBar).getByRole('button', { name: managerCopy.walkIn }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId('admin-view-banner')).not.toBeInTheDocument();
  });

  it('Tạm dừng calls pause endpoint and Khách đến quầy opens the walk-in modal', async () => {
    const user = userEvent.setup();
    renderHostPos();

    const topBar = await screen.findByTestId('host-pos-top-bar');
    const pauseBtn = within(topBar).getByRole('button', {
      name: managerCopy.pause,
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
      within(topBar).getByRole('button', { name: managerCopy.walkIn }),
    );
    expect(await screen.findByTestId('walk-in-modal')).toBeInTheDocument();
  });

  it('POST /api/tickets with HOST_MANUAL when walk-in form is submitted', async () => {
    const user = userEvent.setup();
    renderHostPos();

    const topBar = await screen.findByTestId('host-pos-top-bar');
    await user.click(
      within(topBar).getByRole('button', { name: managerCopy.walkIn }),
    );

    const modal = await screen.findByTestId('walk-in-modal');
    const nameInput = within(modal).getByRole('textbox', {
      name: /Tên khách/i,
    });
    await user.clear(nameInput);
    await user.type(nameInput, 'Nguyen Walk');

    const submitButtons = within(modal).getAllByRole('button', {
      name: managerCopy.walkIn,
    });
    await user.click(submitButtons[0]!);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([input, init]) => {
        const url = String(input);
        const method = String(init?.method ?? 'GET').toUpperCase();
        return method === 'POST' && url.includes('/api/tickets');
      });
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String(postCall![1]?.body ?? '{}')) as {
        branchId: string;
        customerName: string;
        paxCount: number;
        source: string;
      };
      expect(body).toEqual(
        expect.objectContaining({
          branchId: BRANCH_ID,
          customerName: 'Nguyen Walk',
          paxCount: 2,
          source: 'HOST_MANUAL',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('walk-in-modal')).not.toBeInTheDocument();
    });
  });
});

describe('Host POS — pinned summoned strip', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
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

  it('appears with Đã đến and Giữ chỗ when >=1 CALLED ticket', async () => {
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
      within(strip).getByRole('button', { name: managerCopy.seat }),
    ).toBeInTheDocument();
    expect(
      within(strip).getByRole('button', { name: managerCopy.hold }),
    ).toBeInTheDocument();
  });
});

describe('Host POS — waiting ledger', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = mockFetchSnapshot({
      tickets: [...WAITING_TICKETS],
      waitingCount: 2,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a single primary Gọi button per waiting row', async () => {
    renderHostPos();

    const ledger = await screen.findByTestId('waiting-ledger');
    const rows = within(ledger).getAllByTestId(/^waiting-row-/);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const summonButtons = within(row).getAllByRole('button', {
        name: managerCopy.summon,
      });
      expect(summonButtons).toHaveLength(1);
      // Progressive disclosure: no seat / hold / cancel as primary row actions
      expect(
        within(row).queryByRole('button', { name: managerCopy.seat }),
      ).not.toBeInTheDocument();
      expect(
        within(row).queryByRole('button', { name: managerCopy.hold }),
      ).not.toBeInTheDocument();
      expect(
        within(row).queryByRole('button', { name: managerCopy.cancel }),
      ).not.toBeInTheDocument();
    }

    expect(within(ledger).getByText(DISPLAY_A014)).toBeInTheDocument();
    expect(within(ledger).getByText(DISPLAY_A015)).toBeInTheDocument();
  });

  it('keeps Ưu tiên, Đổi số khách, Hủy số inside Thêm row action drawer', async () => {
    const user = userEvent.setup();
    renderHostPos();

    const ledger = await screen.findByTestId('waiting-ledger');
    const row = within(ledger).getByTestId('waiting-row-ticket-a014');

    const moreBtn = within(row).getByRole('button', {
      name: managerCopy.more,
    });
    expect(moreBtn).toBeInTheDocument();

    expect(
      within(row).queryByRole('button', { name: managerCopy.bump }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: managerCopy.changeParty }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: managerCopy.cancel }),
    ).not.toBeInTheDocument();

    await user.click(moreBtn);

    const drawer = await screen.findByTestId('row-action-drawer');
    expect(
      within(drawer).getByRole('button', { name: managerCopy.bump }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: managerCopy.changeParty }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: managerCopy.cancel }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole('button', { name: managerCopy.close }),
    ).toBeInTheDocument();
  });
});
