/**
 * Platform Admin — `/admin`.
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
import { SuperAdminPage } from '../modules/super-admin';

const OVERVIEW = {
  clients: [
    {
      id: 'client-an-tam',
      name: 'Nhóm An Tâm',
      brands: [
        {
          id: 'merchant-pho24',
          name: 'Phở 24',
          slug: 'pho-24',
          industryType: 'RESTAURANT',
          planTier: 'FREE' as const,
          walletBalanceVnd: 0,
          branches: [
            {
              id: 'branch-pho-d1',
              name: 'Phở 24 — Nguyễn Huệ',
              district: 'Quận 1',
              waitingCount: 5,
              isPaused: false,
            },
            {
              id: 'branch-pho-d3',
              name: 'Phở 24 — Quận 3',
              district: 'Quận 3',
              waitingCount: 1,
              isPaused: false,
            },
          ],
        },
        {
          id: 'merchant-clinic',
          name: 'Phòng Khám An Tâm',
          slug: 'an-tam',
          industryType: 'CLINIC',
          planTier: 'PRO' as const,
          walletBalanceVnd: 100000,
          branches: [
            {
              id: 'branch-clinic-tb',
              name: 'Phòng Khám — Tân Bình',
              district: 'Tân Bình',
              waitingCount: 2,
              isPaused: false,
            },
          ],
        },
      ],
    },
    {
      id: 'client-cafe',
      name: 'Cafe Trung',
      brands: [
        {
          id: 'merchant-cafe',
          name: 'Cafe Trung',
          slug: 'cafe-trung',
          industryType: 'CAFE',
          planTier: 'FREE' as const,
          walletBalanceVnd: 0,
          branches: [
            {
              id: 'branch-cafe-d3',
              name: 'Cafe Trung — Quận 3',
              district: 'Quận 3',
              waitingCount: 0,
              isPaused: false,
            },
          ],
        },
      ],
    },
  ],
};

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<SuperAdminPage />} />
        <Route
          path="/manage/:branchId"
          element={<div data-testid="floor-opened" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mockAdminFetch(): Mock {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url.includes('/api/admin/overview')) {
      return Response.json(OVERVIEW);
    }

    if (method === 'POST' && url.includes('/api/admin/clients')) {
      return Response.json(
        {
          clientId: 'client-new',
          merchantId: 'merchant-new',
          branchId: 'branch-new',
          bucketId: 'bucket-new',
        },
        { status: 201 },
      );
    }

    if (
      method === 'PATCH' &&
      /\/api\/super-admin\/merchants\/[^/]+\/plan/.test(url)
    ) {
      return Response.json({ ok: true });
    }

    if (
      method === 'POST' &&
      /\/api\/super-admin\/branches\/[^/]+\/force-clear/.test(url)
    ) {
      return Response.json({ ok: true, cancelledCount: 1 });
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Admin — overview shell', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockAdminFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('lists clients, brands, and branches with Admin chrome', async () => {
    renderAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    expect(within(panel).getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: /Thêm client/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/GOD\s*MODE/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/GOD\s*MODE/i);

    expect(await screen.findByText('Nhóm An Tâm')).toBeInTheDocument();
    expect(screen.getAllByText('Cafe Trung').length).toBeGreaterThan(0);
    expect(screen.getByText('Phở 24 — Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getByText('Phở 24 — Quận 3')).toBeInTheDocument();
    expect(screen.getByText('Phòng Khám — Tân Bình')).toBeInTheDocument();
    expect(screen.getByText('Cafe Trung — Quận 3')).toBeInTheDocument();
  });
});

describe('Admin — onboard client', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockAdminFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('submits POST /api/admin/clients with clientName', async () => {
    const user = userEvent.setup();
    renderAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    await user.click(
      within(panel).getByRole('button', { name: /Thêm client/i }),
    );

    const form = await screen.findByTestId('onboard-form');
    await user.type(within(form).getByLabelText(/clientName/i), 'Nhóm Mới');
    await user.type(within(form).getByLabelText(/brandName/i), 'Brand Mới');
    await user.type(within(form).getByLabelText(/branchName/i), 'Chi nhánh 1');
    await user.type(within(form).getByLabelText(/^address$/i), '1 Lê Lợi');
    await user.type(within(form).getByLabelText(/district/i), 'Quận 1');

    await user.click(
      within(form).getByRole('button', { name: /Thêm client/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/clients',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const onboardCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).includes('/api/admin/clients') &&
        String((init as RequestInit)?.method ?? '').toUpperCase() === 'POST'
      );
    });
    expect(onboardCall).toBeDefined();
    const body = JSON.parse(String((onboardCall![1] as RequestInit).body));
    expect(body.clientName).toBe('Nhóm Mới');
  });
});

describe('Admin — open floor', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockAdminFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('navigates to /manage/:branchId', async () => {
    const user = userEvent.setup();
    renderAdmin();

    const row = await screen.findByTestId('branch-row-branch-pho-d1');
    await user.click(
      within(row).getByRole('button', { name: /Mở quầy/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('floor-opened')).toBeInTheDocument();
    });
  });
});

describe('Admin — plan_tier override', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockAdminFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('toggles plan via PATCH super-admin merchants plan', async () => {
    const user = userEvent.setup();
    renderAdmin();

    const brand = await screen.findByTestId('brand-merchant-pho24');
    expect(within(brand).getByText(/^FREE$/)).toBeInTheDocument();

    await user.click(
      within(brand).getByRole('button', { name: /Đổi gói/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/super-admin\/merchants\/merchant-pho24\/plan/,
        ),
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });

    const planCall = fetchMock.mock.calls.find(([url, init]) => {
      const u = String(url);
      const m = String((init as RequestInit)?.method ?? '');
      return /plan/i.test(u) && /PATCH/i.test(m);
    });
    expect(planCall).toBeDefined();
    const body = JSON.parse(String((planCall![1] as RequestInit).body));
    expect(body.planTier ?? body.plan_tier).toMatch(/^PRO$/i);
    expect(body.merchantId).toBe('merchant-pho24');
  });
});

describe('Admin — force-clear stuck queues', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockAdminFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires confirm before POST force-clear', async () => {
    const user = userEvent.setup();
    renderAdmin();

    const row = await screen.findByTestId('branch-row-branch-pho-d1');

    await user.click(
      within(row).getByRole('button', { name: /Xóa hàng chờ/i }),
    );

    const forceClearBefore = fetchMock.mock.calls.filter(([url, init]) => {
      const u = String(url);
      const m = String((init as RequestInit)?.method ?? 'GET');
      return /force-clear/i.test(u) && /POST/i.test(m);
    });
    expect(forceClearBefore).toHaveLength(0);

    await user.click(
      within(row).getByRole('button', { name: /Xác nhận xóa/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/super-admin\/branches\/branch-pho-d1\/force-clear/,
        ),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
