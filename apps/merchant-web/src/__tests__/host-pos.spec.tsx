/**
 * Host POS / Manager floor — Vietnamese accessible names + floor behavior.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { managerCopy } from '@luotdi/shared';
import { HostPosPage } from '../modules/host-pos';
import { UNDO_WINDOW_MS, waitTone } from '../modules/host-pos/HostPosPage';

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
  queueStatus: 'OPEN' as string,
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

vi.mock('../hooks/useQueueSocket', () => ({ useQueueSocket: () => ({ connected: true }) }));

const BUCKETS = [
  { id: 'bucket-a', prefix: 'A', labelVi: '01-02 KHÁCH', minPax: 1, maxPax: 2 },
  { id: 'bucket-b', prefix: 'B', labelVi: '03-04 KHÁCH', minPax: 3, maxPax: 4 },
  { id: 'bucket-c', prefix: 'C', labelVi: '05-12 KHÁCH', minPax: 5, maxPax: 12 },
];
const STATS = { servedToday: 86, cancelledToday: 3, walletBalanceVnd: 412000 };

function patchCalls(fetchMock: Mock) {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) as { action: string } }));
}

let fetchMock: Mock;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});

function setup(overrides: Partial<typeof SNAPSHOT_BASE> & Record<string, unknown> = {}) {
  fetchMock = mockFetchSnapshot({ buckets: BUCKETS, stats: STATS, ...overrides } as Partial<typeof SNAPSHOT_BASE>);
  vi.stubGlobal('fetch', fetchMock);
  return renderHostPos();
}

describe('Call Console — layout', () => {
  it('shows Đang mời, GỌI SỐ TIẾP (Space), per-table call, called list, tabs and stats strip', async () => {
    setup({ tickets: [CALLED_TICKET, ...WAITING_TICKETS] });
    expect(await screen.findByTestId('serving-number')).toHaveTextContent(DISPLAY_B003);
    expect(screen.getByRole('button', { name: /GỌI SỐ TIẾP/ })).toHaveTextContent('Space');
    for (const p of ['A', 'B', 'C']) expect(screen.getByRole('button', { name: managerCopy.callNextIn(p) })).toBeInTheDocument();
    expect(screen.getByTestId('summoned-strip')).toHaveTextContent(`${managerCopy.calledNotArrived} (0)`);
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /Tất cả/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: /Bàn A · 1–2\s*2/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /Giữ chỗ/ })).toBeInTheDocument();
    const stats = screen.getByTestId('host-pos-metrics');
    expect(stats).toHaveTextContent('86');
    expect(stats).toHaveTextContent(managerCopy.statServed);
    expect(stats).toHaveTextContent('412.000đ');
    // Mascot is NOT on the normal working screen.
    // Round 4: Bé Vé idles in the rail corner only; none in the working area.
    expect(screen.getAllByTestId(/^be-ve-/).every((el) => el.closest('nav'))).toBe(true);
  });

  it('table tabs filter rows; wait time is colour-coded', async () => {
    const user = userEvent.setup();
    const bRow = { ...WAITING_TICKETS[0]!, id: 'ticket-b9', displayNumber: `B${MIDDLE_DOT}009`, bucketId: 'bucket-b', paxCount: 4 };
    setup({ tickets: [...WAITING_TICKETS, bRow] });
    await screen.findByTestId('waiting-row-ticket-a014');
    await user.click(screen.getByRole('tab', { name: /Bàn B/ }));
    expect(screen.queryByTestId('waiting-row-ticket-a014')).toBeNull();
    expect(screen.getByTestId('waiting-row-ticket-b9')).toBeInTheDocument();
    expect(waitTone(18)).toBe('h');
    expect(waitTone(14)).toBe('m');
    expect(waitTone(9)).toBe('n');
  });

  it('search filters by name or number', async () => {
    const user = userEvent.setup();
    setup({ tickets: WAITING_TICKETS });
    await screen.findByTestId('waiting-row-ticket-a014');
    await user.type(screen.getByRole('searchbox', { name: managerCopy.search }), 'tran');
    expect(screen.queryByTestId('waiting-row-ticket-a014')).toBeNull();
    expect(screen.getByTestId('waiting-row-ticket-a015')).toBeInTheDocument();
  });
});

describe('Call Console — call next + undo', () => {
  it('GỌI SỐ TIẾP shows the toast with Bé Vé and sends SUMMON only after the undo window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup({ tickets: WAITING_TICKETS });
    await screen.findByTestId('waiting-row-ticket-a014');
    fireEvent.click(screen.getByRole('button', { name: /GỌI SỐ TIẾP/ }));
    const toast = await screen.findByTestId('call-toast');
    expect(toast).toHaveTextContent(managerCopy.toastCalled(DISPLAY_A014, 'Nguyen Van A'));
    expect(within(toast).getByTestId('be-ve-excited')).toBeInTheDocument();
    expect(screen.getByTestId('serving-number')).toHaveTextContent(DISPLAY_A014);
    expect(patchCalls(fetchMock)).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);
    });
    expect(patchCalls(fetchMock)).toEqual([{ url: '/api/host/tickets/ticket-a014/action', body: { action: 'SUMMON' } }]);
  });

  it('Hoàn tác (or Z) cancels the call — nothing is sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup({ tickets: WAITING_TICKETS });
    await screen.findByTestId('waiting-row-ticket-a014');
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await screen.findByTestId('call-toast');
    fireEvent.keyDown(window, { key: 'z' });
    expect(screen.queryByTestId('call-toast')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);
    });
    expect(patchCalls(fetchMock)).toHaveLength(0);
  });

  it('Tiếp bàn B calls the first ticket of that table', async () => {
    const bRow = { ...WAITING_TICKETS[1]!, id: 'ticket-b9', displayNumber: `B${MIDDLE_DOT}009`, bucketId: 'bucket-b' };
    setup({ tickets: [...WAITING_TICKETS, bRow] });
    await screen.findByTestId('waiting-row-ticket-a014');
    fireEvent.click(screen.getByRole('button', { name: managerCopy.callNextIn('B') }));
    expect(await screen.findByTestId('call-toast')).toHaveTextContent(`B${MIDDLE_DOT}009`);
  });
});

describe('Call Console — shortcuts', () => {
  it('↵ seats and H holds the Đang mời ticket; typing in inputs does not trigger', async () => {
    setup({ tickets: [CALLED_TICKET, ...WAITING_TICKETS] });
    await screen.findByTestId('serving-number');
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(patchCalls(fetchMock).at(-1)?.body.action).toBe('SEAT'));
    fireEvent.keyDown(window, { key: 'h' });
    await waitFor(() => expect(patchCalls(fetchMock).at(-1)?.body.action).toBe('HOLD'));
    const n = patchCalls(fetchMock).length;
    const search = screen.getByRole('searchbox', { name: managerCopy.search });
    fireEvent.keyDown(search, { key: ' ' });
    fireEvent.keyDown(search, { key: 'h' });
    expect(patchCalls(fetchMock)).toHaveLength(n);
    expect(screen.queryByTestId('call-toast')).toBeNull();
  });

  it('N opens the walk-in modal and submits HOST_MANUAL', async () => {
    const user = userEvent.setup();
    setup({ tickets: WAITING_TICKETS });
    await screen.findByTestId('waiting-row-ticket-a014');
    fireEvent.keyDown(window, { key: 'n' });
    const modal = await screen.findByTestId('walk-in-modal');
    await user.type(within(modal).getByLabelText(/Tên/), 'Khach Le');
    await user.click(within(modal).getByRole('button', { name: managerCopy.walkIn }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/api/tickets') && (i as RequestInit)?.method === 'POST');
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ customerName: 'Khach Le', source: 'HOST_MANUAL' });
    });
  });
});

describe('Call Console — mascot placements', () => {
  it('empty state shows Bé Vé with walk-in + QR actions', async () => {
    setup({ tickets: [], waitingCount: 0 });
    const empty = await screen.findByTestId('empty-state');
    expect(within(empty).getByTestId('be-ve-idle')).toBeInTheDocument();
    expect(within(empty).getByRole('button', { name: `+ ${managerCopy.walkIn}` })).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: managerCopy.printQr })).toBeInTheDocument();
  });

  it('paused: banner with sleeping Bé Vé, GỌI SỐ TIẾP disabled, Mở lại calls pause endpoint', async () => {
    const user = userEvent.setup();
    setup({ tickets: WAITING_TICKETS, isPaused: true, queueStatus: 'PAUSED' });
    const banner = await screen.findByTestId('paused-banner');
    expect(within(banner).getByTestId('be-ve-sleep')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GỌI SỐ TIẾP/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByTestId('call-toast')).toBeNull();
    await user.click(within(banner).getByRole('button', { name: managerCopy.resume }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u]) => String(u).includes('/pause'));
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ paused: false });
    });
  });
});

describe('Call Console — called list + row drawer', () => {
  it('HELD tickets appear in Đã gọi · chưa đến with Gọi lại', async () => {
    const user = userEvent.setup();
    const heldT = { ...CALLED_TICKET, id: 'ticket-h', status: 'HELD' as const, displayNumber: `B${MIDDLE_DOT}004` };
    setup({ tickets: [CALLED_TICKET, heldT, ...WAITING_TICKETS] });
    const strip = await screen.findByTestId('summoned-strip');
    expect(strip).toHaveTextContent(`B${MIDDLE_DOT}004`);
    await user.click(within(strip).getByRole('button', { name: managerCopy.recall }));
    await waitFor(() => expect(patchCalls(fetchMock).at(-1)).toEqual({ url: '/api/host/tickets/ticket-h/action', body: { action: 'SUMMON' } }));
  });

  it('keeps Ưu tiên, Đổi số khách, Hủy số inside the ··· drawer', async () => {
    const user = userEvent.setup();
    setup({ tickets: WAITING_TICKETS });
    const row = await screen.findByTestId('waiting-row-ticket-a014');
    expect(within(row).queryByRole('button', { name: managerCopy.bump })).toBeNull();
    await user.click(within(row).getByRole('button', { name: managerCopy.more }));
    const drawer = screen.getByTestId('row-action-drawer');
    for (const label of [managerCopy.bump, managerCopy.changeParty, managerCopy.cancel]) {
      expect(within(drawer).getByRole('button', { name: label })).toBeInTheDocument();
    }
    await user.click(within(drawer).getByRole('button', { name: managerCopy.cancel }));
    await waitFor(() => expect(patchCalls(fetchMock).at(-1)?.body.action).toBe('CANCEL'));
  });

});
