/**
 * Super-Admin God Mode — Phase 4.3 RED specs.
 * GREEN (AGENT-FRONTEND): implement SuperAdminPage so these pass.
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

const BRANCHES = [
  {
    id: 'branch-1',
    name: 'Pho 24 — Nguyen Hue',
    merchantId: 'merchant-1',
    merchantSlug: 'pho-24',
    merchantName: 'Pho 24',
    planTier: 'FREE' as const,
    waitingCount: 5,
  },
  {
    id: 'branch-2',
    name: 'Clinic Saigon — Lab',
    merchantId: 'merchant-2',
    merchantSlug: 'clinic-sg',
    merchantName: 'Clinic Saigon',
    planTier: 'PRO' as const,
    waitingCount: 2,
  },
];

const SUPER_SNAPSHOT = {
  branches: BRANCHES,
};

function renderSuperAdmin(path = '/super-admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/super-admin" element={<SuperAdminPage />} />
        <Route path="/host/:branchId" element={<div data-testid="host-impersonation" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockSuperFetch(
  overrides: Partial<typeof SUPER_SNAPSHOT> = {},
): Mock {
  const payload = { ...SUPER_SNAPSHOT, ...overrides };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      method === 'GET' &&
      (url.includes('/api/super-admin/branches') ||
        url.includes('/api/super-admin/snapshot') ||
        url.includes('/api/admin/super/branches'))
    ) {
      return Response.json(payload);
    }

    if (
      (method === 'POST' || method === 'PATCH' || method === 'PUT') &&
      (url.includes('/api/super-admin/') || url.includes('/api/admin/super/'))
    ) {
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Super-Admin — God Mode shell', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockSuperFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('lists branches with merchant plan tier', async () => {
    renderSuperAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    expect(within(panel).getByText(/GOD\s*MODE/i)).toBeInTheDocument();
    expect(within(panel).getByText(/SUPER-?ADMIN/i)).toBeInTheDocument();

    const list = within(panel).getByTestId('branch-list');
    expect(within(list).getByText(/Pho 24 — Nguyen Hue/i)).toBeInTheDocument();
    expect(within(list).getByText(/Clinic Saigon — Lab/i)).toBeInTheDocument();

    const rowFree = within(list).getByTestId('branch-row-branch-1');
    const rowPro = within(list).getByTestId('branch-row-branch-2');
    expect(within(rowFree).getByText(/^FREE$/)).toBeInTheDocument();
    expect(within(rowPro).getByText(/^PRO$/)).toBeInTheDocument();
  });
});

describe('Super-Admin — impersonate branch', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockSuperFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('impersonates a branch and routes to host console', async () => {
    const user = userEvent.setup();
    renderSuperAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    const row = within(panel).getByTestId('branch-row-branch-1');

    await user.click(
      within(row).getByRole('button', { name: /IMPERSONATE/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('host-impersonation')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/super-admin\/(branches\/[^/]+\/)?impersonate|\/api\/admin\/super\/impersonate/,
      ),
      expect.objectContaining({
        method: expect.stringMatching(/POST|PUT|PATCH/i),
      }),
    );
  });
});

describe('Super-Admin — plan_tier override', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockSuperFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('overrides plan_tier FREE <-> PRO for a merchant', async () => {
    const user = userEvent.setup();
    renderSuperAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    const row = within(panel).getByTestId('branch-row-branch-1');

    expect(within(row).getByText(/\bFREE\b/)).toBeInTheDocument();

    await user.click(
      within(row).getByRole('button', {
        name: /SET\s*PRO|OVERRIDE.*PRO|PLAN.*PRO|TO\s*PRO/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/super-admin\/(merchants\/[^/]+\/)?plan|\/api\/admin\/super\/plan/,
        ),
        expect.objectContaining({
          method: expect.stringMatching(/POST|PUT|PATCH/i),
        }),
      );
    });

    const planCall = fetchMock.mock.calls.find(([url, init]) => {
      const u = String(url);
      const m = String((init as RequestInit)?.method ?? '');
      return (
        /plan/i.test(u) &&
        /POST|PUT|PATCH/i.test(m)
      );
    });
    expect(planCall).toBeDefined();
    const body = JSON.parse(String((planCall![1] as RequestInit).body));
    expect(body.planTier ?? body.plan_tier).toMatch(/^PRO$/i);
  });
});

describe('Super-Admin — force-clear stuck queues', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockSuperFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('force-clears stuck WAITING/CALLED/HELD tickets for a branch', async () => {
    const user = userEvent.setup();
    renderSuperAdmin();

    const panel = await screen.findByTestId('super-admin-panel');
    const row = within(panel).getByTestId('branch-row-branch-1');

    await user.click(
      within(row).getByRole('button', {
        name: /FORCE\s*CLEAR|CLEAR\s*QUEUE|CLEAR\s*STUCK/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/super-admin\/(branches\/[^/]+\/)?(force-clear|clear-queue)|\/api\/admin\/super\/(force-clear|clear)/,
        ),
        expect.objectContaining({
          method: expect.stringMatching(/POST|PUT|PATCH|DELETE/i),
        }),
      );
    });
  });
});
