/**
 * TV display — round 4 Style D states (live · calling · paused · empty · loading · offline · error · clinic).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { WsServerEvent } from '@luotdi/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { TvKioskPage, buildViSummonSpeech } from '../modules/tv-kiosk';
import { backoffMs, deriveTvState, sentenceCase, vnClock, type TvSnapshot } from '../modules/tv-kiosk/tvLogic';

const D = '\u00B7';
const N = (p: string, n: number) => `${p}${D}${String(n).padStart(3, '0')}`;
const BRANCH_ID = 'branch-pho-d1';

const SNAP: TvSnapshot = {
  branchId: BRANCH_ID,
  branchSlug: 'pho-24-nh',
  branchName: 'Phở 24 Nguyễn Huệ',
  merchantName: 'Phở 24',
  address: '56 Nguyễn Huệ',
  district: 'Quận 1',
  routingMode: 'PARTY_SIZE',
  industryType: 'RESTAURANT',
  isPaused: false,
  servedToday: 86,
  walkInQrUrl: 'https://zalo.me/app/link?qr=qr-pho-nguyen-hue',
  nowServing: { displayNumber: N('A', 12), bucketPrefix: 'A', bucketLabelVi: 'Bàn A', minPax: 1, maxPax: 2, calledAt: Date.now() },
  recent: [{ displayNumber: N('A', 11), calledAt: 1 }, { displayNumber: N('B', 4), calledAt: 1 }, { displayNumber: N('C', 1), calledAt: 1 }],
  buckets: [
    { id: 'a', prefix: 'A', labelVi: '01-02 KHÁCH', minPax: 1, maxPax: 2, partiesWaiting: 5, estimatedWaitMins: 12, next: [N('A', 13), N('A', 14), N('A', 15)] },
    { id: 'b', prefix: 'B', labelVi: '03-04 KHÁCH', minPax: 3, maxPax: 4, partiesWaiting: 2, estimatedWaitMins: 18, next: [N('B', 5), N('B', 6)] },
    { id: 'c', prefix: 'C', labelVi: '05-12 KHÁCH', minPax: 5, maxPax: 12, partiesWaiting: 1, estimatedWaitMins: 25, next: [N('C', 2)] },
  ],
};

const sock = vi.hoisted(() => {
  const listeners = new Set<(e: WsServerEvent) => void>();
  return { listeners, emit: (e: WsServerEvent) => listeners.forEach((l) => l(e)) };
});

vi.mock('../hooks/useQueueSocket', () => ({
  useQueueSocket: vi.fn((opts: { onEvent?: (e: WsServerEvent) => void } = {}) => {
    if (opts.onEvent) sock.listeners.add(opts.onEvent);
    return { connected: true };
  }),
}));

function renderTv(path = `/tv/branch/${BRANCH_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tv/branch/:branchId" element={<TvKioskPage />} />
        <Route path="/tv/:branchSlug" element={<TvKioskPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function serve(payload: Partial<TvSnapshot> | (() => Response | Promise<Response>)) {
  const f = vi.fn(async () => (typeof payload === 'function' ? payload() : Response.json({ ...SNAP, ...payload })));
  vi.stubGlobal('fetch', f);
  return f;
}

const call = (num: string) =>
  act(async () => {
    sock.emit({ type: 'YOUR_TURN_CALLED', branchId: BRANCH_ID, ticketId: `t-${num}`, displayNumber: num, at: Date.now() });
  });

let speak: Mock;
beforeEach(() => {
  sock.listeners.clear();
  speak = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn(), getVoices: () => [] });
  vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; constructor(public text: string) {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TV · live', () => {
  it('shows the current number after a reload, next 3 per bàn and recent calls — numbers only', async () => {
    serve({});
    renderTv();
    const hero = await screen.findByTestId('tv-summoning-panel');
    expect(within(hero).getByTestId('tv-now-number').textContent).toBe(N('A', 12));
    expect(within(hero).getByText('Mời vào bàn A')).toBeInTheDocument();
    expect(within(hero).getByText(/Nhóm 1–2 khách/)).toBeInTheDocument();
    expect(within(screen.getByTestId('tv-recent')).getAllByText(/·/).map((e) => e.textContent)).toEqual([N('A', 11), N('B', 4), N('C', 1)]);
    const a = screen.getByTestId('tv-bucket-A');
    expect(within(a).getByText('Bàn A · 1–2 khách')).toBeInTheDocument();
    expect(within(a).getByText(N('A', 13))).toBeInTheDocument();
    expect(within(a).getByText(/chờ 12 phút/)).toBeInTheDocument();
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Đang mở');
    expect(screen.getByTestId('be-ve-idle')).toBeInTheDocument();
    expect(screen.getByTestId('walk-in-qr').querySelector('[data-qr-url]')!.getAttribute('data-qr-url')).toBe(SNAP.walkInQrUrl);
  });

  it('per-branch slug route hits /api/branches/slug/:slug', async () => {
    const f = serve({});
    renderTv('/tv/pho-24-nh');
    await screen.findByTestId('tv-summoning-panel');
    expect(String(f.mock.calls[0]![0 as never])).toContain('/api/branches/slug/pho-24-nh');
  });

  it('branch-id route never uses the merchant slug lookup', async () => {
    const f = serve({});
    renderTv('/tv/branch/branch-pho-d3');
    await screen.findByTestId('tv-summoning-panel');
    const urls = f.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.every((u) => u.includes('/api/branches/branch-pho-d3/tv'))).toBe(true);
  });
});

describe('TV · calling', () => {
  it('turns green with "Xin mời số", chimes then speaks vi-VN, and queues overlapping calls', async () => {
    serve({});
    renderTv();
    await screen.findByTestId('tv-summoning-panel');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await call(N('A', 14));
    const hero = screen.getByTestId('tv-summoning-panel');
    expect(hero.dataset.calling).toBe('true');
    expect(within(hero).getByText('Xin mời số')).toBeInTheDocument();
    expect(within(hero).getByTestId('tv-now-number').textContent).toBe(N('A', 14));
    expect(screen.getByTestId('be-ve-celebrate')).toBeInTheDocument();
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    const u = speak.mock.calls[0]![0] as { lang: string; text: string };
    expect(u.lang).toBe('vi-VN');
    expect(u.text).toMatch(/Xin mời quý khách số A, không một bốn, vào bàn/);

    await call(N('B', 5)); // inside the 6s window → queued
    expect(within(hero).getByTestId('tv-now-number').textContent).toBe(N('A', 14));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByTestId('tv-now-number').textContent).toBe(N('B', 5));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByTestId('tv-summoning-panel').dataset.calling).toBeUndefined();
  });

  it('QUEUE_UPDATED{status:CALLED} (what the room actually sends TVs) triggers the call', async () => {
    serve({});
    renderTv();
    await screen.findByTestId('tv-summoning-panel');
    await act(async () => {
      sock.emit({ type: 'QUEUE_UPDATED', branchId: BRANCH_ID, ticketId: 't', displayNumber: N('C', 2), status: 'CALLED', at: Date.now() });
    });
    expect(screen.getByTestId('tv-summoning-panel').dataset.calling).toBe('true');
    expect(screen.getByTestId('tv-now-number').textContent).toBe(N('C', 2));
  });

  it('builds the vi-VN summon phrase', () => {
    expect(buildViSummonSpeech(N('A', 14))).toBe('Xin mời quý khách số A, không một bốn, vào bàn');
  });
});

describe('TV · paused / empty / clinic', () => {
  it('paused: yellow hero with sleeping Bé Vé, list retitled GIỮ LƯỢT, QR greyed', async () => {
    serve({ isPaused: true });
    renderTv();
    expect(await screen.findByText('Quán nghỉ tay một chút nhé!')).toBeInTheDocument();
    expect(screen.getByTestId('be-ve-sleep')).toBeInTheDocument();
    expect(screen.getByText('GIỮ LƯỢT')).toBeInTheDocument();
    expect(screen.getByText('Tạm dừng lấy số mới')).toBeInTheDocument();
    expect(screen.getByTestId('walk-in-qr').className).toContain('tv-qrc-off');
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Tạm dừng');
  });

  it('empty: "Chưa có ai đang chờ", no-wait buckets and served-today count', async () => {
    serve({ nowServing: null, recent: [], buckets: SNAP.buckets.map((b) => ({ ...b, partiesWaiting: 0, next: [] })) });
    renderTv();
    expect(await screen.findByText('Chưa có ai đang chờ')).toBeInTheDocument();
    expect(screen.getAllByText('Không phải chờ · mời vào ngay')).toHaveLength(3);
    expect(screen.getByText('86')).toBeInTheDocument();
  });

  it('clinic: patient wording and service names instead of Bàn', async () => {
    serve({
      routingMode: 'SERVICE_TYPE',
      industryType: 'CLINIC',
      nowServing: { displayNumber: N('G', 4), bucketPrefix: 'G', bucketLabelVi: 'KHÁM TỔNG QUÁT', minPax: 1, maxPax: 1, calledAt: 1 },
      buckets: [{ id: 'g', prefix: 'G', labelVi: 'KHÁM TỔNG QUÁT', minPax: 1, maxPax: 1, partiesWaiting: 6, estimatedWaitMins: 20, next: [N('G', 5)] }],
    });
    renderTv();
    expect(await screen.findByText('Mời bệnh nhân vào Quầy khám')).toBeInTheDocument();
    expect(screen.getAllByText('Khám tổng quát').length).toBeGreaterThan(0);
    expect(screen.getByTestId('tv-bucket-G')).toHaveTextContent('6 bệnh nhân');
    expect(screen.queryByText(/Bàn G/)).toBeNull();
  });
});

describe('TV · loading / offline / error', () => {
  it('loading shows the connecting message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderTv();
    expect(await screen.findByText('Đang kết nối màn hình…')).toBeInTheDocument();
  });

  it('offline keeps the last data, turns the chip hot and hides the hero mascot', async () => {
    let fail = false;
    serve(() => (fail ? Promise.reject(new Error('net')) : Response.json(SNAP)));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderTv();
    await screen.findByTestId('tv-summoning-panel');
    fail = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_100); });
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Mất kết nối · đang thử lại');
    expect(screen.getByTestId('tv-offline-bar')).toHaveTextContent(/Đang kết nối lại · số hiển thị lúc \d\d:\d\d/);
    expect(screen.getByTestId('tv-now-number').textContent).toBe(N('A', 12));
    expect(screen.queryByTestId('be-ve-idle')).toBeNull();
    fail = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByTestId('tv-status')).toHaveTextContent('Đang mở');
  });

  it('unknown branch shows the not-found screen with the URL and retries after 30s', async () => {
    const f = serve(() => Response.json({ code: 'BRANCH_NOT_FOUND' }, { status: 404 }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderTv('/tv/branch/branch-nope');
    expect(await screen.findByText('Không tìm thấy chi nhánh cho màn hình này')).toBeInTheDocument();
    expect(screen.getByText('/tv/branch/branch-nope')).toBeInTheDocument();
    const before = f.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
    expect(f.mock.calls.length).toBe(before + 1);
  });
});

describe('TV · pure logic', () => {
  it('derives states and helpers', () => {
    expect(deriveTvState({ snapshot: null, notFound: false, failing: false, calling: false })).toBe('loading');
    expect(deriveTvState({ snapshot: SNAP, notFound: true, failing: false, calling: false })).toBe('error');
    expect(deriveTvState({ snapshot: SNAP, notFound: false, failing: true, calling: true })).toBe('offline');
    expect(deriveTvState({ snapshot: SNAP, notFound: false, failing: false, calling: true })).toBe('calling');
    expect(deriveTvState({ snapshot: { ...SNAP, isPaused: true }, notFound: false, failing: false, calling: false })).toBe('paused');
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(10)).toBe(30_000);
    expect(sentenceCase('KHÁM TỔNG QUÁT')).toBe('Khám tổng quát');
    expect(vnClock(Date.UTC(2026, 9, 15, 5, 5))).toEqual({ time: '12:05', date: 'Thứ Năm, 15/10' });
    expect(useQueueSocket).toBeDefined();
  });
});
