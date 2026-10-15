/**
 * Phase 2 shell — home doors, route renames, and legacy redirects.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { AppRoutes } from '../App';

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

function mockShellFetch(): Mock {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/api/super-admin/branches')) {
      return Response.json({ branches: [] });
    }

    if (url.includes('/api/branches/branch-pho-d1/snapshot')) {
      return Response.json({
        branchId: 'branch-pho-d1',
        branchName: 'Phở 24 — Nguyễn Huệ',
        waitingCount: 0,
        avgWaitMins: 0,
        queueStatus: 'OPEN',
        isPaused: false,
        tickets: [],
      });
    }

    if (url.includes('/api/admin/config')) {
      return Response.json({
        merchantId: 'merchant-pho24',
        merchantSlug: 'pho-24',
        merchantName: 'Phở 24',
        branchId: 'branch-pho-d1',
        branchName: 'Phở 24 — Nguyễn Huệ',
        walletBalanceVnd: 0,
        planTier: 'PRO',
        buckets: [],
        walkInQrUrl: 'https://luotdi.app/b/qr-pho-nguyen-hue',
        vietQr: {
          accountNumber: '0123456789',
          bankCode: 'Vietcombank',
          accountName: 'LUOTDI PHO 24',
        },
      });
    }

    return Response.json({ error: 'not mocked', url }, { status: 404 });
  });
}

describe('merchant shell routes', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', mockShellFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('home shows Admin, Client, and Quản lý doors', () => {
    renderShell('/');

    expect(screen.getByRole('heading', { name: 'LượtĐi' })).toBeInTheDocument();
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Client').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quản lý').length).toBeGreaterThan(0);

    expect(screen.queryByText('HOST POS')).not.toBeInTheDocument();
    expect(screen.queryByText('OWNER ADMIN')).not.toBeInTheDocument();
    expect(screen.queryByText('SUPER ADMIN')).not.toBeInTheDocument();
    expect(screen.queryByText('GOD MODE')).not.toBeInTheDocument();
    expect(screen.queryByText('Local demo console')).not.toBeInTheDocument();
  });

  it('redirects /super-admin to SuperAdminPage at /admin', async () => {
    renderShell('/super-admin');

    await waitFor(() => {
      expect(screen.getByTestId('super-admin-panel')).toBeInTheDocument();
    });
  });

  it('redirects /host/:branchId to HostPosPage at /manage/:branchId', async () => {
    renderShell('/host/branch-pho-d1');

    await waitFor(() => {
      expect(screen.getByTestId('host-pos-top-bar')).toBeInTheDocument();
    });
  });

  it('redirects /admin/:branchId to OwnerAdminPage at /client/branches/:branchId', async () => {
    renderShell('/admin/branch-pho-d1');

    await waitFor(() => {
      expect(screen.getByTestId('bucket-editor').closest('[data-page="owner-admin"]')).toBeTruthy();
      expect(
        document.querySelector('[data-page="owner-admin"]'),
      ).toBeInTheDocument();
    });
  });
});
