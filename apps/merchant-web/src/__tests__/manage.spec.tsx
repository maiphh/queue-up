/** Manager sub-pages (M5–M8): history, reports, QR & TV, settings. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { managerCopy as m } from '@luotdi/shared';
import { HistoryPage, QrPage, ReportsPage, SettingsPage } from '../modules/manage';
import { diffSettings, validateSettings, type Settings } from '../modules/manage/SettingsPage';

type Handler = (url: string, init?: RequestInit) => unknown;
const calls: { url: string; init?: RequestInit }[] = [];
function mockFetch(handler: Handler) {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const out = handler(url, init);
    if (out instanceof Response) return out;
    if (out === undefined) return new Response(JSON.stringify({}), { status: 200 });
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}
function renderAt(path: string, el: ReactElement, pattern: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={el} /></Routes></MemoryRouter>);
}
afterEach(() => vi.unstubAllGlobals());

const TODAY_MS = Date.now();
const row = (over: Record<string, unknown> = {}) => ({
  id: 't1', displayNumber: 'A·007', customerName: 'Nguyễn Thị Lan', phoneMasked: '090****321', paxCount: 2,
  bucketPrefix: 'A', source: 'ZALO', status: 'SEATED', result: 'SEATED', createdAt: TODAY_MS - 30 * 60_000,
  calledAt: TODAY_MS - 5 * 60_000, heldAt: null, seatedAt: TODAY_MS - 3 * 60_000, cancelledAt: null, waitedMins: 25,
  zns: { sentAt: TODAY_MS - 12 * 60_000, amountVnd: 400 }, canRestore: false, canRecall: false, ...over,
});
const hist = (rows: unknown[]) => ({
  date: '2026-10-15', counts: { all: rows.length, seated: 1, noShow: 0, cancelled: 1 },
  stats: { issued: rows.length, served: 1, avgWaitMins: 14, noShowPct: 0 }, rows,
});

describe('HistoryPage', () => {
  it('renders the rail, rows and opens a detail drawer with timeline; restore posts', async () => {
    mockFetch((url) => {
      if (url.includes('/history')) return hist([row(), row({ id: 't2', displayNumber: 'B·004', customerName: 'Phạm Gia Hân', status: 'CANCELLED', result: 'CANCELLED', calledAt: null, seatedAt: null, cancelledAt: TODAY_MS, zns: null, canRestore: true })]);
      if (url.includes('/restore')) return { ok: true };
      if (url.includes('/snapshot')) return { buckets: [{ prefix: 'A' }, { prefix: 'B' }] };
      return { branchName: 'Phở 24 Nguyễn Huệ', isPaused: false };
    });
    renderAt('/manage/b1/history', <HistoryPage />, '/manage/:branchId/history');
    expect(await screen.findByText('Nguyễn Thị Lan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: m.nav.history })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: m.nav.tv })).toHaveAttribute('target', '_blank');
    fireEvent.click(screen.getByText('Phạm Gia Hân'));
    const drawer = await screen.findByTestId('history-detail');
    expect(drawer).toHaveTextContent(m.history.tlIssuedZalo);
    expect(screen.getByRole('button', { name: m.history.recall })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: m.history.restore }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/tickets/t2/restore') && c.init?.method === 'POST')).toBe(true));
  });

  it('filters by result via the query string', async () => {
    mockFetch((url) => (url.includes('/history') ? hist([row()]) : {}));
    renderAt('/manage/b1/history', <HistoryPage />, '/manage/:branchId/history');
    await screen.findByText('Nguyễn Thị Lan');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${m.history.filterCancelled}`) }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('result=cancelled'))).toBe(true));
  });

  it('shows the Bé Vé empty state when the day has no tickets', async () => {
    mockFetch((url) => (url.includes('/history') ? hist([]) : {}));
    renderAt('/manage/b1/history', <HistoryPage />, '/manage/:branchId/history');
    expect(await screen.findByTestId('history-empty')).toHaveTextContent(m.history.emptyToday);
  });

  it('shows the error line on failure', async () => {
    mockFetch((url) => (url.includes('/history') ? new Response('x', { status: 500 }) : {}));
    renderAt('/manage/b1/history', <HistoryPage />, '/manage/:branchId/history');
    expect(await screen.findByText(m.history.loadError)).toBeInTheDocument();
  });
});

describe('ReportsPage', () => {
  const rep = {
    range: { key: '7d', from: '2026-10-09', to: '2026-10-15', days: 7 }, updatedAt: TODAY_MS,
    kpis: { issued: 40, served: 30, avgWaitMins: 14, lostPct: 7.4, znsSent: 12, znsSpentVnd: 4800, deltas: { servedPct: 12, avgWaitMins: -3, lostPts: 1.1 } },
    byHour: [{ hour: 11, avgPerDay: 2 }, { hour: 12, avgPerDay: 5 }],
    buckets: [{ prefix: 'A', label: '1–2 khách', served: 20, avgWaitMins: 12, noShowPct: 6 }],
    source: { zaloPct: 78, counterPct: 22 }, suggestion: '12h–13h khách bàn B chờ 26 phút.',
  };
  it('renders KPIs with deltas, bars and suggestion; switching range refetches', async () => {
    mockFetch((url) => (url.includes('/reports') ? rep : {}));
    renderAt('/manage/b1/reports', <ReportsPage />, '/manage/:branchId/reports');
    expect(await screen.findByTestId('reports-suggestion')).toHaveTextContent('chờ 26 phút');
    expect(screen.getByText(/▲ 12%/)).toBeInTheDocument();
    expect(screen.getByText(/▼ 3 phút/)).toHaveClass('r4-up');
    fireEvent.click(screen.getByRole('button', { name: m.reports.ranges['30d'] }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('range=30d'))).toBe(true));
  });
  it('shows loading copy before data arrives', async () => {
    mockFetch(() => new Promise(() => undefined) as unknown as Response);
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderAt('/manage/b1/reports', <ReportsPage />, '/manage/:branchId/reports');
    expect(await screen.findByText(m.reports.loading)).toBeInTheDocument();
  });
});

describe('QrPage', () => {
  it('renders standee QR, TV chip, and regenerate goes through a confirm dialog', async () => {
    mockFetch((url) => (url.endsWith('/qr')
      ? { branchId: 'b1', branchName: 'Phở 24', qrToken: 'qr-x', walkInQrUrl: 'https://zalo.me/app/link?qr=qr-x', tvSlug: 'pho-24-nh', tvConnected: 0, checkedAt: TODAY_MS }
      : url.includes('/regenerate') ? { ok: true } : {}));
    renderAt('/manage/b1/qr', <QrPage />, '/manage/:branchId/qr');
    expect(await screen.findByTestId('qr-standee')).toBeInTheDocument();
    expect(screen.getByTestId('qr-tv-chip')).toHaveTextContent(m.qr.tvConnected(0));
    expect(screen.getByRole('link', { name: m.qr.openTv })).toHaveAttribute('href', '/tv/pho-24-nh');
    fireEvent.click(screen.getByRole('button', { name: m.qr.regen }));
    expect(screen.getByRole('dialog')).toHaveTextContent(m.qr.regenTitle);
    expect(calls.some((c) => c.url.includes('/regenerate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: m.qr.regenConfirm }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/regenerate') && c.init?.method === 'POST')).toBe(true));
  });
});

const SETTINGS: Settings = {
  allowRemoteQueue: true, openTime: '10:00', closeTime: '21:30', autoPauseWaitMins: 45, graceMins: 10,
  shortcutsEnabled: true, znsAlmostThreshold: 2, znsCallEnabled: true, tvTts: true, tvVoice: 'female-south',
  tvChime: true, tvMascot: true, tvStatic: false, walletBalanceVnd: 50_000, merchantName: 'Phở 24',
};

describe('SettingsPage', () => {
  it('validate/diff helpers mirror the API', () => {
    expect(validateSettings({ ...SETTINGS, graceMins: 45 })).toEqual({ graceMins: m.settings.errGrace });
    expect(validateSettings({ ...SETTINGS, znsAlmostThreshold: 0 })).toEqual({ znsAlmostThreshold: m.settings.errThreshold });
    expect(validateSettings({ ...SETTINGS, openTime: '10:00', closeTime: '10:00' })).toEqual({ openTime: m.settings.errTimeSame });
    expect(diffSettings(SETTINGS, { ...SETTINGS, closeTime: '22:00' })).toEqual({ openTime: '10:00', closeTime: '22:00' });
  });

  it('stepper change shows the save bar and PATCHes only the diff', async () => {
    mockFetch((url, init) => (url.includes('/settings') ? (init?.method === 'PATCH' ? { ...SETTINGS, graceMins: 11 } : SETTINGS) : {}));
    renderAt('/manage/b1/settings', <SettingsPage />, '/manage/:branchId/settings');
    fireEvent.click(await screen.findByRole('button', { name: `${m.settings.grace} +` }));
    expect(screen.getByTestId('settings-savebar')).toHaveTextContent(m.settings.barChanges(1));
    fireEvent.click(screen.getByRole('button', { name: m.settings.save }));
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch && JSON.parse(String(patch.init?.body))).toEqual({ graceMins: 11 });
    });
    await waitFor(() => expect(screen.queryByTestId('settings-savebar')).toBeNull());
  });

  it('invalid typed value blocks save and shows field + error line', async () => {
    mockFetch((url) => (url.includes('/settings') ? SETTINGS : {}));
    renderAt('/manage/b1/settings', <SettingsPage />, '/manage/:branchId/settings');
    fireEvent.change(await screen.findByRole('textbox', { name: m.settings.grace }), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: m.settings.save }));
    expect(await screen.findByTestId('settings-error')).toHaveTextContent(m.settings.errGrace);
    expect(screen.getByTestId('settings-savebar')).toHaveTextContent(m.settings.barErrors(1));
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
  });

  it('surfaces server field errors', async () => {
    mockFetch((url, init) => (url.includes('/settings')
      ? init?.method === 'PATCH' ? new Response(JSON.stringify({ code: 'INVALID_SETTINGS', fields: { tvVoice: 'Giọng không hợp lệ' } }), { status: 400 }) : SETTINGS
      : {}));
    renderAt('/manage/b1/settings', <SettingsPage />, '/manage/:branchId/settings');
    fireEvent.click(await screen.findByRole('switch', { name: m.settings.mascot }));
    fireEvent.click(screen.getByRole('button', { name: m.settings.save }));
    expect(await screen.findByTestId('settings-error')).toHaveTextContent('Giọng không hợp lệ');
  });
});
