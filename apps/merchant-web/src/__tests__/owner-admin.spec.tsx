/** Client portfolio (M2) + branch setup / top-up (M3). */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientCopy as c } from '@luotdi/shared';
import { OwnerAdminPage } from '../modules/owner-admin';
import { checkCoverage, type Setup } from '../modules/owner-admin/BranchSetupView';

const calls: { url: string; init?: RequestInit }[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const out = handler(url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out ?? {}), { status: 200 });
  }));
}
afterEach(() => vi.unstubAllGlobals());
const at = (path: string, el: ReactElement = <OwnerAdminPage />) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/client" element={el} /><Route path="/client/branches/:branchId" element={el} /></Routes></MemoryRouter>,
);

const PORTFOLIO = {
  clientId: 'client-an-tam', clientName: 'Nhóm An Tâm',
  kpis: { waiting: 16, servedToday: 143, avgWaitMins: 15, openBranches: 2, totalBranches: 3, pausedBranches: 1 },
  brands: [
    { id: 'm-pho', name: 'Phở 24', slug: 'pho-24', industryType: 'RESTAURANT', planTier: 'PRO', walletBalanceVnd: 50_000, walletMessages: 125, walletLow: false, branches: [
      { id: 'branch-pho-d1', name: 'Phở 24 Nguyễn Huệ', address: '56 Nguyễn Huệ', district: 'Quận 1', tvSlug: 'pho-24-nh', waitingCount: 12, servedToday: 86, avgWaitMins: 14, isPaused: false, queueStatus: 'OPEN' },
      { id: 'branch-pho-d3', name: 'Phở 24 Quận 3', address: '88 Võ Văn Tần', district: 'Quận 3', tvSlug: 'pho-24-q3', waitingCount: 0, servedToday: 31, avgWaitMins: null, isPaused: true, queueStatus: 'PAUSED' },
    ] },
    { id: 'm-clinic', name: 'Phòng Khám An Tâm', slug: 'an-tam', industryType: 'CLINIC', planTier: 'FREE', walletBalanceVnd: 4_000, walletMessages: 10, walletLow: true, branches: [] },
  ],
};

describe('Client portfolio', () => {
  it('renders KPIs, brands with plan + wallet chip, branch cards and actions', async () => {
    mockFetch(() => PORTFOLIO);
    at('/client');
    expect(await screen.findByRole('heading', { name: 'Nhóm An Tâm' })).toBeInTheDocument();
    expect(screen.getByTestId('portfolio-kpis')).toHaveTextContent('143');
    expect(screen.getByText(c.pausedCount(1))).toBeInTheDocument();
    const b = screen.getByTestId('portfolio-branch-branch-pho-d1');
    expect(within(b).getByText(c.statusOpen)).toBeInTheDocument();
    expect(within(b).getByRole('link', { name: c.viewFloor })).toHaveAttribute('href', '/manage/branch-pho-d1');
    expect(within(b).getByRole('link', { name: c.setup })).toHaveAttribute('href', '/client/branches/branch-pho-d1');
    expect(within(b).getByRole('link', { name: 'TV' })).toHaveAttribute('href', '/tv/pho-24-nh');
    expect(within(screen.getByTestId('portfolio-branch-branch-pho-d3')).getByText(c.statusPaused)).toHaveClass('r4-sc-y');
    expect(screen.getByTestId('wallet-chip-m-clinic')).toHaveClass('r4-sc-h');
    expect(screen.getByText('FREE')).toBeInTheDocument();
  });
  it('search filters branches', async () => {
    mockFetch(() => PORTFOLIO);
    at('/client');
    await screen.findByTestId('portfolio-branch-branch-pho-d1');
    fireEvent.change(screen.getByRole('textbox', { name: c.searchBranch }), { target: { value: 'Quận 3' } });
    expect(screen.queryByTestId('portfolio-branch-branch-pho-d1')).toBeNull();
    expect(screen.getByTestId('portfolio-branch-branch-pho-d3')).toBeInTheDocument();
  });
  it('empty and error states', async () => {
    mockFetch(() => ({ ...PORTFOLIO, brands: [] }));
    const r = at('/client');
    expect(await screen.findByTestId('portfolio-empty')).toHaveTextContent(c.emptyTitle);
    r.unmount();
    mockFetch(() => new Response('x', { status: 500 }));
    at('/client');
    expect(await screen.findByText(c.loadError)).toBeInTheDocument();
    mockFetch(() => PORTFOLIO);
    fireEvent.click(screen.getByRole('button', { name: c.retry }));
    expect(await screen.findByTestId('portfolio-kpis')).toBeInTheDocument();
  });
});

const SETUP: Setup = {
  branchId: 'branch-pho-d1', branchName: 'Phở 24 Nguyễn Huệ', address: '56 Nguyễn Huệ', district: 'Quận 1', routingMode: 'PARTY_SIZE',
  tvSlug: 'pho-24-nh', merchantName: 'Phở 24', merchantSlug: 'pho-24', industryType: 'RESTAURANT', planTier: 'PRO',
  buckets: [
    { id: 'a', prefix: 'A', labelVi: '1–2 khách', minPax: 1, maxPax: 2, activeCounters: 4, isActive: true, issued: 7 },
    { id: 'b', prefix: 'B', labelVi: '3–4 khách', minPax: 3, maxPax: 4, activeCounters: 3, isActive: true, issued: 2 },
    { id: 'c', prefix: 'C', labelVi: '5–12 khách', minPax: 5, maxPax: 12, activeCounters: 2, isActive: true, issued: 0 },
  ],
  wallet: { balanceVnd: 50_000, messages: 125, daysLeft: 6, low: false, sharedAcrossBrand: true },
  ledger: [{ id: 'l1', amountVnd: -400, txType: 'ZNS_CALL_ALERT', createdAt: Date.now(), displayNumber: 'A·007', reference: null }],
  vietQr: { accountNumber: '0123456789', bankCode: 'VCB', bankName: 'Vietcombank', accountName: 'PHỞ 24' },
  vietQrMemo: 'LUOTDI pho-24',
};

describe('Branch setup', () => {
  it('coverage helper finds gaps and overlaps', () => {
    expect(checkCoverage('PARTY_SIZE', SETUP.buckets)).toMatchObject({ message: null, maxPax: 12 });
    expect(checkCoverage('PARTY_SIZE', [SETUP.buckets[0]!, SETUP.buckets[2]!]).message).toBe(c.errGap(3, 4));
    expect(checkCoverage('PARTY_SIZE', [SETUP.buckets[0]!, { ...SETUP.buckets[1]!, minPax: 2 }]).message).toBe(c.errOverlap('B'));
    expect(checkCoverage('SERVICE_TYPE', [{ ...SETUP.buckets[0]!, labelVi: '' }]).fields.A).toBe(c.errService);
  });

  it('renders the bucket editor with coverage ok and wallet shared across the brand', async () => {
    mockFetch(() => SETUP);
    at('/client/branches/branch-pho-d1');
    const editor = await screen.findByTestId('bucket-editor');
    expect(within(editor).getByTestId('bucket-row-A')).toHaveTextContent('A·008');
    expect(screen.getByTestId('coverage')).toHaveTextContent(c.coverageOk(12));
    expect(screen.getByTestId('vietqr-topup')).toHaveTextContent(c.walletShared('Phở 24'));
    expect(screen.getByText(c.txZns('A·007'))).toBeInTheDocument();
  });

  it('edits a stepper, shows an overlap error, then fixes and PUTs the bucket set', async () => {
    mockFetch((url, init) => (init?.method === 'PUT' ? { ...SETUP, buckets: SETUP.buckets.map((b) => (b.prefix === 'A' ? { ...b, maxPax: 3 } : b)) } : SETUP));
    at('/client/branches/branch-pho-d1');
    const rowA = await screen.findByTestId('bucket-row-A');
    fireEvent.click(within(rowA).getByRole('button', { name: `${c.maxPax} +` }));
    expect(screen.getByTestId('coverage')).toHaveTextContent(c.errOverlap('B'));
    fireEvent.click(screen.getByRole('button', { name: c.save }));
    expect(await screen.findByText(c.saveError)).toBeInTheDocument();
    expect(calls.some((x) => x.init?.method === 'PUT')).toBe(false);
    const rowB = screen.getByTestId('bucket-row-B');
    fireEvent.click(within(rowB).getByRole('button', { name: `${c.minPax} +` }));
    expect(screen.getByTestId('coverage')).toHaveTextContent(c.coverageOk(12));
    fireEvent.click(screen.getByRole('button', { name: c.save }));
    await waitFor(() => {
      const put = calls.find((x) => x.init?.method === 'PUT');
      expect(put?.url).toBe('/api/client/branches/branch-pho-d1/buckets');
      const body = JSON.parse(String(put?.init?.body)) as { routingMode: string; buckets: { prefix: string; maxPax: number; minPax: number }[] };
      expect(body.routingMode).toBe('PARTY_SIZE');
      expect(body.buckets.find((b) => b.prefix === 'A')?.maxPax).toBe(3);
      expect(body.buckets.find((b) => b.prefix === 'B')?.minPax).toBe(4);
    });
  });

  it('adds bàn D after C and switches to Theo dịch vụ with service names', async () => {
    mockFetch(() => SETUP);
    at('/client/branches/branch-pho-d1');
    fireEvent.click(await screen.findByRole('button', { name: `+ ${c.addBucket} D` }));
    expect(screen.getByTestId('bucket-row-D')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: c.byService }));
    expect(within(screen.getByTestId('bucket-row-A')).getByRole('textbox', { name: c.serviceName })).toBeInTheDocument();
  });

  it('creates a VietQR transfer with memo LUOTDI <slug> and shows the pending chip', async () => {
    mockFetch((url) => (url.endsWith('/topup')
      ? { amountVnd: 100_000, memo: 'LUOTDI pho-24', bank: SETUP.vietQr, qrImageUrl: 'https://img.vietqr.io/x.png', balanceVnd: 50_000 }
      : SETUP));
    at('/client/branches/branch-pho-d1');
    fireEvent.click(await screen.findByRole('button', { name: c.createTransfer }));
    const pending = await screen.findByTestId('vietqr-pending');
    expect(pending).toHaveTextContent('LUOTDI pho-24');
    expect(pending).toHaveTextContent(c.pending);
    expect(JSON.parse(String(calls.find((x) => x.url.endsWith('/topup'))?.init?.body))).toEqual({ amountVnd: 100_000 });
  });
});
