/** Platform Admin overview (M1) + onboarding wizard (M1b). */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminCopy as a } from '@luotdi/shared';
import { SuperAdminPage } from '../modules/super-admin';
import { suggestTvSlug } from '../modules/super-admin/OnboardWizard';
import type { Overview } from '../modules/super-admin/SuperAdminPage';

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
const at = (path = '/admin', el: ReactElement = <SuperAdminPage />) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/admin" element={el} /><Route path="/manage/:id" element={<div data-testid="floor-opened" />} /></Routes></MemoryRouter>,
);

const OVERVIEW: Overview = {
  kpis: { waitingTotal: 18, ticketsToday: 212, pausedBranches: 1, lowWalletBrands: 1, freeNearQuota: 0, branches: 4, brands: 3, lowWalletFirst: { name: 'Cafe Trung', balanceVnd: 800 }, freeQuota: 200 },
  attention: [
    { kind: 'LOW_WALLET', brandId: 'merchant-cafe', title: 'Cafe Trung còn 800đ ≈ 2 tin Zalo', detail: 'Hết ví…' },
    { kind: 'LONG_PAUSE', brandId: 'merchant-clinic', branchId: 'branch-clinic-tb', title: 'An Tâm Tân Bình tạm dừng 42 phút', detail: '4 nhóm vẫn đang giữ lượt' },
  ],
  clients: [
    { id: 'client-an-tam', name: 'Nhóm An Tâm', brands: [
      { id: 'merchant-pho24', name: 'Phở 24', slug: 'pho-24', industryType: 'RESTAURANT', planTier: 'PRO', walletBalanceVnd: 50_000, walletLow: false, monthlyTicketCount: 42, monthlyQuota: null, branches: [
        { id: 'branch-pho-d1', name: 'Phở 24 Nguyễn Huệ', district: 'Quận 1', slug: 'pho-24-nh', waitingCount: 12, isPaused: false },
        { id: 'branch-pho-d3', name: 'Phở 24 Quận 3', district: 'Quận 3', slug: 'pho-24-q3', waitingCount: 0, isPaused: false },
      ] },
      { id: 'merchant-clinic', name: 'Phòng Khám An Tâm', slug: 'an-tam', industryType: 'CLINIC', planTier: 'PRO', walletBalanceVnd: 120_000, walletLow: false, monthlyTicketCount: 65, monthlyQuota: null, branches: [
        { id: 'branch-clinic-tb', name: 'An Tâm Tân Bình', district: 'Tân Bình', slug: 'an-tam-tan-binh', waitingCount: 4, isPaused: true },
      ] },
    ] },
    { id: 'client-cafe', name: 'Cafe Trung', brands: [
      { id: 'merchant-cafe', name: 'Cafe Trung', slug: 'cafe-trung', industryType: 'CAFE', planTier: 'FREE', walletBalanceVnd: 800, walletLow: true, monthlyTicketCount: 18, monthlyQuota: 200, branches: [
        { id: 'branch-cafe-d3', name: 'Cafe Trung Điện Biên Phủ', district: 'Quận 3', slug: 'cafe-trung-q3', waitingCount: 2, isPaused: false },
      ] },
    ] },
  ],
};

describe('Admin overview', () => {
  it('renders KPIs, grouped table, plan + wallet chips and Cần chú ý', async () => {
    mockFetch(() => OVERVIEW);
    at();
    const panel = await screen.findByTestId('super-admin-panel');
    expect(within(panel).getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(await screen.findByTestId('admin-kpis')).toHaveTextContent('212');
    expect(screen.getByText(a.groupHead('Nhóm An Tâm', 3))).toBeInTheDocument();
    expect(within(screen.getByTestId('branch-row-branch-cafe-d3')).getByText('18 / 200')).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-attention')).getByText(/tạm dừng 42 phút/)).toBeInTheDocument();
    expect(screen.queryByText('GOD MODE')).toBeNull();
    expect(screen.queryByText('RESTAURANT')).toBeNull();
  });

  it('status + industry filters and search narrow the table', async () => {
    mockFetch(() => OVERVIEW);
    at();
    await screen.findByTestId('branch-row-branch-pho-d1');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${a.fPaused}`) }));
    expect(screen.queryByTestId('branch-row-branch-pho-d1')).toBeNull();
    expect(screen.getByTestId('branch-row-branch-clinic-tb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${a.fAll}`) }));
    fireEvent.click(screen.getByRole('button', { name: a.industry.CAFE }));
    expect(screen.getByTestId('branch-row-branch-cafe-d3')).toBeInTheDocument();
    expect(screen.queryByTestId('branch-row-branch-pho-d1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: a.allIndustries }));
    fireEvent.change(screen.getByRole('textbox', { name: a.search }), { target: { value: 'quận 3' } });
    expect(screen.getByTestId('branch-row-branch-pho-d3')).toBeInTheDocument();
    expect(screen.queryByTestId('branch-row-branch-clinic-tb')).toBeNull();
  });

  it('Mở quầy navigates; Đổi gói PATCHes the flipped plan', async () => {
    mockFetch(() => OVERVIEW);
    at();
    const brand = await screen.findByTestId('branch-row-branch-cafe-d3');
    fireEvent.click(within(brand).getByRole('button', { name: a.changePlan }));
    await waitFor(() => {
      const p = calls.find((x) => x.init?.method === 'PATCH');
      expect(p?.url).toBe('/api/super-admin/merchants/merchant-cafe/plan');
      expect(JSON.parse(String(p?.init?.body))).toEqual({ planTier: 'PRO' });
    });
    fireEvent.click(within(screen.getByTestId('branch-row-branch-pho-d1')).getByRole('button', { name: a.openFloor }));
    expect(await screen.findByTestId('floor-opened')).toBeInTheDocument();
  });

  it('Xóa hàng chờ needs the branch slug typed before Xác nhận xóa', async () => {
    mockFetch((url) => (url.includes('force-clear') ? { ok: true, cancelledCount: 12 } : OVERVIEW));
    at();
    fireEvent.click(within(await screen.findByTestId('branch-row-branch-pho-d1')).getByRole('button', { name: a.clearQueue }));
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(a.confirmBody(12));
    const confirm = within(dlg).getByRole('button', { name: a.confirmClear });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'pho-24' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'pho-24-nh' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.some((x) => x.url === '/api/super-admin/branches/branch-pho-d1/force-clear' && x.init?.method === 'POST')).toBe(true));
    expect(await screen.findByText(a.cleared(12))).toBeInTheDocument();
  });

  it('loading, empty and error states', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const r = at();
    expect(screen.getByTestId('admin-loading')).toBeInTheDocument();
    r.unmount();
    mockFetch(() => ({ ...OVERVIEW, clients: [] }));
    const r2 = at();
    expect(await screen.findByTestId('admin-empty')).toHaveTextContent(a.empty);
    r2.unmount();
    mockFetch(() => new Response('x', { status: 500 }));
    at();
    expect(await screen.findByText(a.loadError)).toBeInTheDocument();
  });
});

describe('Onboarding wizard', () => {
  it('suggests a TV slug from brand + branch', () => {
    expect(suggestTvSlug('Bún Chả Hương Liên', 'Lê Văn Hưu')).toBe('huong-lien-lvh');
  });

  it('walks 4 steps with validation and posts OnboardClientRequest + tvSlug + graceMins', async () => {
    mockFetch((url) => (url === '/api/admin/clients' ? new Response(JSON.stringify({ branchId: 'b-new', tvSlug: 'huong-lien-lvh', walkInQrUrl: 'x' }), { status: 201 }) : OVERVIEW));
    at('/admin?view=new');
    const form = await screen.findByTestId('onboard-form');
    fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    expect(within(form).getByText(a.required)).toBeInTheDocument();
    fireEvent.change(within(form).getByRole('textbox', { name: a.clientName }), { target: { value: 'Nhóm Bếp Việt' } });
    fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    fireEvent.change(within(form).getByRole('textbox', { name: a.brandName }), { target: { value: 'Bún Chả Hương Liên' } });
    expect(screen.getByTestId('onboard-preview')).toHaveTextContent('Bún Chả Hương Liên');
    fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    expect(within(form).getByText(a.chipClient('Nhóm Bếp Việt'))).toBeInTheDocument();
    fireEvent.change(within(form).getByRole('textbox', { name: a.branchName }), { target: { value: 'Lê Văn Hưu' } });
    fireEvent.change(within(form).getByRole('textbox', { name: a.district }), { target: { value: 'Hai Bà Trưng' } });
    fireEvent.change(within(form).getByRole('textbox', { name: a.address }), { target: { value: '24 Lê Văn Hưu' } });
    expect(within(form).getByRole('textbox', { name: a.tvSlug })).toHaveValue('huong-lien-lvh');
    fireEvent.click(within(form).getByRole('button', { name: `${a.graceMins} +` }));
    fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    fireEvent.click(within(form).getByRole('button', { name: new RegExp(a.routeService) }));
    fireEvent.click(within(form).getByRole('button', { name: a.submit }));
    expect(await screen.findByTestId('onboard-success')).toHaveTextContent(a.successTitle('Bún Chả Hương Liên'));
    const body = JSON.parse(String(calls.find((x) => x.url === '/api/admin/clients')?.init?.body));
    expect(body).toMatchObject({
      clientName: 'Nhóm Bếp Việt', brandName: 'Bún Chả Hương Liên', industryType: 'RESTAURANT', branchName: 'Lê Văn Hưu',
      district: 'Hai Bà Trưng', address: '24 Lê Văn Hưu', routingMode: 'SERVICE_TYPE', planTier: 'FREE', tvSlug: 'huong-lien-lvh', graceMins: 11,
    });
    expect(screen.getByRole('link', { name: a.openFloor })).toHaveAttribute('href', '/manage/b-new');
  });

  it('duplicate slug jumps back to step 3 with the field error', async () => {
    mockFetch((url) => (url === '/api/admin/clients'
      ? new Response(JSON.stringify({ code: 'SLUG_TAKEN', fields: { tvSlug: 'Đường dẫn này đã có quán dùng' } }), { status: 409 })
      : OVERVIEW));
    at('/admin?view=new');
    const form = await screen.findByTestId('onboard-form');
    const fill = (name: string, v: string) => fireEvent.change(within(form).getByRole('textbox', { name }), { target: { value: v } });
    fill(a.clientName, 'A'); fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    fill(a.brandName, 'Phở 24'); fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    fill(a.branchName, 'Nguyễn Huệ'); fill(a.district, 'Q1'); fill(a.address, '1'); fireEvent.click(within(form).getByRole('button', { name: /Tiếp/ }));
    fireEvent.click(within(form).getByRole('button', { name: a.submit }));
    expect(await within(form).findByText('Đường dẫn này đã có quán dùng')).toBeInTheDocument();
    expect(within(form).getByText(a.createError)).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: a.tvSlug })).toBeInTheDocument();
  });
});
