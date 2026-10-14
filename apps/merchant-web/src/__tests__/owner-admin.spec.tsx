/**
 * Merchant Owner Config — Phase 4.3 RED specs.
 * GREEN (AGENT-FRONTEND): implement OwnerAdminPage so these pass.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { OwnerAdminPage } from '../modules/owner-admin';

const MERCHANT_ID = 'merchant-1';
const MERCHANT_SLUG = 'pho-24';
const BRANCH_ID = 'branch-1';

type AdminBucket = {
  id: string;
  prefix: string;
  labelVi: string;
  labelEn: string;
  minPax: number;
  maxPax: number;
  activeCounters: number;
  isActive: boolean;
};

const BUCKETS: AdminBucket[] = [
  {
    id: 'bucket-a',
    prefix: 'A',
    labelVi: '01-02 KHACH',
    labelEn: '01-02 GUESTS',
    minPax: 1,
    maxPax: 2,
    activeCounters: 4,
    isActive: true,
  },
  {
    id: 'bucket-b',
    prefix: 'B',
    labelVi: '03-04 KHACH',
    labelEn: '03-04 GUESTS',
    minPax: 3,
    maxPax: 4,
    activeCounters: 3,
    isActive: true,
  },
  {
    id: 'bucket-c',
    prefix: 'C',
    labelVi: '05-12 KHACH',
    labelEn: '05-12 GUESTS',
    minPax: 5,
    maxPax: 12,
    activeCounters: 2,
    isActive: true,
  },
];

const OWNER_CONFIG = {
  merchantId: MERCHANT_ID,
  merchantSlug: MERCHANT_SLUG,
  merchantName: 'Pho 24',
  branchId: BRANCH_ID,
  branchName: 'Pho 24 — Nguyen Hue',
  walletBalanceVnd: 12_000,
  planTier: 'FREE' as const,
  buckets: BUCKETS,
  walkInQrUrl: `https://luotdi.app/b/qr-${MERCHANT_SLUG}`,
  vietQr: {
    accountNumber: '0123456789',
    bankCode: 'Vietcombank',
    accountName: 'LUOTDI PHO 24',
  },
};

function renderOwnerAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<OwnerAdminPage />} />
        <Route path="/admin/:branchId" element={<OwnerAdminPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockOwnerFetch(
  overrides: Partial<typeof OWNER_CONFIG> = {},
): Mock {
  const payload = { ...OWNER_CONFIG, ...overrides };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      method === 'GET' &&
      (url.includes('/api/admin/config') ||
        url.includes(`/api/admin/branches/${BRANCH_ID}`) ||
        url.includes('/api/owner/config'))
    ) {
      return Response.json(payload);
    }

    if (
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'POST'
    ) {
      if (
        url.includes('/api/admin/buckets') ||
        url.includes('/api/owner/buckets')
      ) {
        return Response.json({ ok: true });
      }
      if (
        url.includes('/api/admin/vietqr') ||
        url.includes('/api/owner/vietqr')
      ) {
        return Response.json({ ok: true });
      }
    }

    return Response.json({ error: 'not mocked', url, method }, { status: 404 });
  });
}

describe('Owner Admin — dynamic bucket editor', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockOwnerFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders bucket rows with prefixes A–C, min/max pax, and active counters', async () => {
    renderOwnerAdmin();

    const editor = await screen.findByTestId('bucket-editor');
    expect(within(editor).getByText(/BUCKET\s*EDITOR|QUEUE\s*BUCKETS/i)).toBeInTheDocument();

    for (const bucket of BUCKETS) {
      const row = within(editor).getByTestId(`bucket-row-${bucket.prefix}`);
      expect(within(row).getByDisplayValue(bucket.prefix)).toBeInTheDocument();
      expect(
        (within(row).getByLabelText(/MIN\s*PAX/i) as HTMLInputElement).value,
      ).toBe(String(bucket.minPax));
      expect(
        (within(row).getByLabelText(/MAX\s*PAX/i) as HTMLInputElement).value,
      ).toBe(String(bucket.maxPax));
      expect(
        (
          within(row).getByLabelText(/ACTIVE\s*(COUNTERS|TABLES)/i) as HTMLInputElement
        ).value,
      ).toBe(String(bucket.activeCounters));
    }
  });

  it('edits min/max pax and active counters then saves', async () => {
    const user = userEvent.setup();
    renderOwnerAdmin();

    const editor = await screen.findByTestId('bucket-editor');
    const rowA = within(editor).getByTestId('bucket-row-A');

    const minInput = within(rowA).getByLabelText(/MIN\s*PAX/i);
    const maxInput = within(rowA).getByLabelText(/MAX\s*PAX/i);
    const countersInput = within(rowA).getByLabelText(
      /ACTIVE\s*(COUNTERS|TABLES)/i,
    );

    fireEvent.change(minInput, { target: { value: '1' } });
    fireEvent.change(maxInput, { target: { value: '3' } });
    fireEvent.change(countersInput, { target: { value: '5' } });

    expect((minInput as HTMLInputElement).value).toBe('1');
    expect((maxInput as HTMLInputElement).value).toBe('3');
    expect((countersInput as HTMLInputElement).value).toBe('5');

    await user.click(
      within(editor).getByRole('button', { name: /SAVE\s*BUCKETS/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/(admin|owner)\/buckets/),
        expect.objectContaining({
          method: expect.stringMatching(/PUT|PATCH|POST/i),
        }),
      );
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/buckets') &&
        /PUT|PATCH|POST/i.test(String((init as RequestInit)?.method ?? '')),
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String((saveCall![1] as RequestInit).body));
    const buckets = body.buckets ?? body;
    const savedA = Array.isArray(buckets)
      ? buckets.find(
          (b: { prefix?: string; id?: string }) =>
            b.prefix === 'A' || b.id === 'bucket-a',
        )
      : undefined;
    expect(savedA).toMatchObject({
      minPax: 1,
      maxPax: 3,
      activeCounters: 5,
    });
  });

  it('adds a new bucket with prefix D–F', async () => {
    const user = userEvent.setup();
    renderOwnerAdmin();

    const editor = await screen.findByTestId('bucket-editor');
    await user.click(
      within(editor).getByRole('button', { name: /ADD\s*BUCKET/i }),
    );

    const newRow = await within(editor).findByTestId(/^bucket-row-[DEF]$/);
    const prefix = newRow.getAttribute('data-testid')?.replace('bucket-row-', '');
    expect(prefix).toMatch(/^[DEF]$/);

    expect(within(editor).getByTestId('bucket-row-A')).toBeInTheDocument();
    expect(within(editor).getByTestId('bucket-row-B')).toBeInTheDocument();
    expect(within(editor).getByTestId('bucket-row-C')).toBeInTheDocument();
    expect(within(editor).getByTestId(`bucket-row-${prefix}`)).toBeInTheDocument();
  });
});

describe('Owner Admin — VietQR Top-Up Generator', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = mockOwnerFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows wallet balance and transfer memo LUOTDI <MERCHANT_SLUG>', async () => {
    renderOwnerAdmin();

    const topUp = await screen.findByTestId('vietqr-topup');
    expect(within(topUp).getByText(/12[\s,.]*000|12000/)).toBeInTheDocument();
    expect(within(topUp).getByText(/WALLET|BALANCE/i)).toBeInTheDocument();

    const memo = within(topUp).getByTestId('vietqr-memo');
    expect(memo).toHaveTextContent(new RegExp(`LUOTDI\\s+${MERCHANT_SLUG}`, 'i'));
  });

  it('generates VietQR payload URL with memo LUOTDI pho-24 and amount', async () => {
    const user = userEvent.setup();
    renderOwnerAdmin();

    const topUp = await screen.findByTestId('vietqr-topup');
    const amountInput = within(topUp).getByLabelText(/AMOUNT|SO\s*TIEN|VND/i);
    await user.clear(amountInput);
    await user.type(amountInput, '50000');

    await user.click(
      within(topUp).getByRole('button', { name: /GENERATE|TAO\s*QR|CREATE\s*QR/i }),
    );

    const payload = await within(topUp).findByTestId('vietqr-payload');
    const text = payload.textContent ?? '';
    const src =
      payload instanceof HTMLImageElement
        ? payload.getAttribute('src') ?? ''
        : payload.querySelector('img')?.getAttribute('src') ?? text;

    expect(`${text} ${src}`).toMatch(/LUOTDI(\+|%20|\s)+pho-24/i);
    expect(`${text} ${src}`).toMatch(/50000/);
  });
});

describe('Owner Admin — printable QR standee', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockOwnerFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('exposes a print-ready standee region with walk-in QR', async () => {
    renderOwnerAdmin();

    const standee = await screen.findByTestId('qr-standee');
    expect(standee).toHaveClass(/print/i);
    expect(
      within(standee).getByText(/SCAN|QUE|HANG|LUOTDI/i),
    ).toBeInTheDocument();
    expect(
      within(standee).getByRole('img', { name: /QR|WALK-?IN/i }),
    ).toBeInTheDocument();
  });
});
