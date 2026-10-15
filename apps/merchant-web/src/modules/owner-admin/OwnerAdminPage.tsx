/**
 * Client portfolio `/client` and branch setup `/client/branches/:branchId`.
 * Bucket editor, VietQR top-up memo LUOTDI <slug>, printable QR standee.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildVietQrMemo, clientCopy } from '@luotdi/shared';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  TabularMetric,
} from '@luotdi/ui-braun';

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

type OwnerConfig = {
  merchantId: string;
  merchantSlug: string;
  merchantName: string;
  branchId: string;
  branchName: string;
  walletBalanceVnd: number;
  planTier: string;
  buckets: AdminBucket[];
  walkInQrUrl: string;
  vietQr: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
};

type PortfolioBranch = {
  id: string;
  name: string;
  district: string;
  waitingCount: number;
  isPaused: boolean;
  queueStatus: string;
};

type PortfolioBrand = {
  id: string;
  name: string;
  slug: string;
  industryType: string;
  branches: PortfolioBranch[];
};

type ClientPortfolio = {
  clientId: string;
  clientName: string;
  brands: PortfolioBrand[];
};

const PREFIX_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function nextPrefix(existing: AdminBucket[]): string | null {
  const used = new Set(existing.map((b) => b.prefix.toUpperCase()));
  return PREFIX_ORDER.find((p) => !used.has(p)) ?? null;
}

function buildVietQrUrl(opts: {
  accountNumber: string;
  bankCode: string;
  amount: number;
  memo: string;
}): string {
  const params = new URLSearchParams({
    acc: opts.accountNumber,
    bank: opts.bankCode,
    amount: String(opts.amount),
    des: opts.memo,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(opts.bankCode)}-${encodeURIComponent(opts.accountNumber)}-compact.png?${params.toString()}`;
}

function ClientPortfolioView() {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<ClientPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/client/portfolio');
      if (!res.ok) {
        setError('Không tải được danh sách thương hiệu.');
        return;
      }
      const data = (await res.json()) as ClientPortfolio;
      setPortfolio(data);
      setError(null);
    } catch {
      setError('Không tải được danh sách thương hiệu.');
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  if (error && !portfolio) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-sans text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!portfolio) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-sans text-sm text-graphite">Đang tải.</p>
      </BraunChassis>
    );
  }

  return (
    <div
      data-page="client-portfolio"
      className="flex min-h-screen flex-col bg-chassis text-carbon"
    >
      <header className="border-b border-grid bg-panel px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          Client
        </p>
        <h1 className="font-sans text-base font-semibold text-carbon">
          {portfolio.clientName}
        </h1>
      </header>

      <section className="m-4" data-testid="client-brands">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          {clientCopy.brands}
        </p>
        <div className="flex flex-col gap-4">
          {portfolio.brands.map((brand) => (
            <GridCell key={brand.id} label={brand.slug}>
              <h2 className="mb-3 font-sans text-base font-semibold text-carbon">
                {brand.name}
              </h2>
              <ul className="flex flex-col gap-3">
                {brand.branches.map((branch) => {
                  const statusLabel = branch.isPaused
                    ? clientCopy.statusPaused
                    : clientCopy.statusOpen;
                  return (
                    <li
                      key={branch.id}
                      data-testid={`portfolio-branch-${branch.id}`}
                      className="border border-grid bg-chassis p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-sans text-sm font-semibold text-carbon">
                          {branch.name}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                          {statusLabel}
                        </p>
                      </div>
                      <p className="mb-3 font-mono text-xs text-graphite tabular">
                        Đang chờ{' '}
                        <TabularMetric
                          size="md"
                          value={String(branch.waitingCount)}
                        />
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <KeycapButton
                          variant="primary"
                          onClick={() => navigate(`/manage/${branch.id}`)}
                        >
                          {clientCopy.viewFloor}
                        </KeycapButton>
                        <KeycapButton
                          variant="secondary"
                          onClick={() =>
                            navigate(`/client/branches/${branch.id}`)
                          }
                        >
                          {clientCopy.setup}
                        </KeycapButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </GridCell>
          ))}
        </div>
      </section>
    </div>
  );
}

function BranchSetupView({ branchId }: { branchId: string }) {
  const [config, setConfig] = useState<OwnerConfig | null>(null);
  const [buckets, setBuckets] = useState<AdminBucket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('50000');
  const [vietQrUrl, setVietQrUrl] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const qs = `?branchId=${encodeURIComponent(branchId)}`;
      const res = await fetch(`/api/admin/config${qs}`);
      if (!res.ok) {
        setError('Không tải được cấu hình chi nhánh.');
        return;
      }
      const data = (await res.json()) as OwnerConfig;
      setConfig(data);
      setBuckets(data.buckets.map((b) => ({ ...b })));
      setError(null);
    } catch {
      setError('Không tải được cấu hình chi nhánh.');
    }
  }, [branchId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const memo = useMemo(
    () => (config ? buildVietQrMemo(config.merchantSlug) : ''),
    [config],
  );

  const updateBucketField = useCallback(
    (
      prefix: string,
      field: 'minPax' | 'maxPax' | 'activeCounters',
      raw: string,
    ) => {
      const n = Number.parseInt(raw, 10);
      setBuckets((prev) =>
        prev.map((b) =>
          b.prefix === prefix
            ? { ...b, [field]: Number.isFinite(n) ? n : 0 }
            : b,
        ),
      );
    },
    [],
  );

  const addBucket = useCallback(() => {
    setBuckets((prev) => {
      const prefix = nextPrefix(prev);
      if (!prefix) return prev;
      const id = `bucket-${prefix.toLowerCase()}`;
      return [
        ...prev,
        {
          id,
          prefix,
          labelVi: `BAN ${prefix}`,
          labelEn: `TABLE ${prefix}`,
          minPax: 1,
          maxPax: 2,
          activeCounters: 1,
          isActive: true,
        },
      ];
    });
  }, []);

  const saveBuckets = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/buckets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: config?.branchId,
          buckets: buckets.map((b) => ({
            id: b.id,
            prefix: b.prefix,
            minPax: b.minPax,
            maxPax: b.maxPax,
            activeCounters: b.activeCounters,
            isActive: b.isActive,
            labelVi: b.labelVi,
            labelEn: b.labelEn,
          })),
        }),
      });
      if (!res.ok) {
        setError('Không lưu được bàn.');
        return;
      }
      setError(null);
      await loadConfig();
    } catch {
      setError('Không lưu được bàn.');
    }
  }, [buckets, config?.branchId, loadConfig]);

  const generateVietQr = useCallback(() => {
    if (!config) return;
    const amount = Number.parseInt(topUpAmount.replace(/\D/g, ''), 10) || 0;
    const url = buildVietQrUrl({
      accountNumber: config.vietQr.accountNumber,
      bankCode: config.vietQr.bankCode,
      amount,
      memo: buildVietQrMemo(config.merchantSlug),
    });
    setVietQrUrl(url);
  }, [config, topUpAmount]);

  if (error && !config) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-sans text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!config) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-sans text-sm text-graphite">Đang tải.</p>
      </BraunChassis>
    );
  }

  return (
    <div
      data-page="owner-admin"
      className="flex min-h-screen flex-col bg-chassis text-carbon"
    >
      <header className="border-b border-grid bg-panel px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          {config.merchantName}
        </p>
        <h1 className="font-sans text-base font-semibold text-carbon">
          {config.branchName}
        </h1>
      </header>

      {error ? (
        <p className="mx-4 mt-3 font-sans text-sm text-carbon">{error}</p>
      ) : null}

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-2">
        <section
          data-testid="bucket-editor"
          className="border border-grid bg-panel p-4"
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            BUCKET EDITOR
          </p>
          <ul className="flex flex-col gap-3">
            {buckets.map((bucket) => (
              <li
                key={bucket.prefix}
                data-testid={`bucket-row-${bucket.prefix}`}
                className="border border-grid bg-chassis p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                    {clientCopy.prefix}
                    <input
                      className="ml-2 min-h-[48px] w-12 border border-grid bg-panel px-2 font-mono text-sm tabular"
                      value={bucket.prefix}
                      readOnly
                      aria-label={clientCopy.prefix}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                    {clientCopy.minPax}
                    <input
                      type="number"
                      className="mt-1 block min-h-[48px] w-20 border border-grid bg-panel px-2 font-mono text-sm tabular"
                      value={bucket.minPax}
                      aria-label={clientCopy.minPax}
                      onChange={(e) =>
                        updateBucketField(
                          bucket.prefix,
                          'minPax',
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                    {clientCopy.maxPax}
                    <input
                      type="number"
                      className="mt-1 block min-h-[48px] w-20 border border-grid bg-panel px-2 font-mono text-sm tabular"
                      value={bucket.maxPax}
                      aria-label={clientCopy.maxPax}
                      onChange={(e) =>
                        updateBucketField(
                          bucket.prefix,
                          'maxPax',
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-graphite">
                    {clientCopy.counters}
                    <input
                      type="number"
                      className="mt-1 block min-h-[48px] w-20 border border-grid bg-panel px-2 font-mono text-sm tabular"
                      value={bucket.activeCounters}
                      aria-label={clientCopy.counters}
                      onChange={(e) =>
                        updateBucketField(
                          bucket.prefix,
                          'activeCounters',
                          e.target.value,
                        )
                      }
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <KeycapButton
              variant="secondary"
              onClick={addBucket}
              disabled={!nextPrefix(buckets)}
            >
              {clientCopy.addBucket}
            </KeycapButton>
            <KeycapButton variant="primary" onClick={() => void saveBuckets()}>
              {clientCopy.save}
            </KeycapButton>
          </div>
        </section>

        <section
          data-testid="vietqr-topup"
          className="border border-grid bg-panel p-4"
        >
          <GridCell label={clientCopy.wallet} className="mb-3">
            <TabularMetric
              size="lg"
              value={`${config.walletBalanceVnd.toLocaleString('en-US')} VND`}
            />
          </GridCell>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-graphite">
            TRANSFER MEMO
          </p>
          <p
            data-testid="vietqr-memo"
            className="mb-3 border border-grid bg-chassis px-3 py-2 font-mono text-sm tabular"
          >
            {memo}
          </p>
          <label className="font-mono text-[10px] uppercase tracking-widest text-graphite">
            Số tiền VND
            <input
              type="number"
              className="mt-1 mb-3 block min-h-[48px] w-full border border-grid bg-chassis px-3 font-mono text-sm tabular"
              value={topUpAmount}
              aria-label="Số tiền VND"
              onChange={(e) => setTopUpAmount(e.target.value)}
            />
          </label>
          <KeycapButton variant="primary" onClick={generateVietQr}>
            {clientCopy.createTransfer}
          </KeycapButton>
          {vietQrUrl ? (
            <div
              data-testid="vietqr-payload"
              className="mt-3 border border-grid bg-chassis p-3"
            >
              <img
                src={vietQrUrl}
                alt="VietQR top-up"
                className="mx-auto max-h-48 border border-grid"
              />
              <p className="mt-2 break-all font-mono text-[10px] text-graphite tabular">
                {vietQrUrl}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <section
        data-testid="qr-standee"
        className="m-4 border border-grid bg-panel p-6 print:block print:m-0 print:border-0 print:p-8"
      >
        <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
          A5 STANDEE / PRINT
        </p>
        <h2 className="mb-4 text-center font-sans text-xl font-semibold tracking-wide">
          SCAN TO QUEUE — LUOTDI
        </h2>
        <p className="mb-4 text-center font-mono text-sm text-graphite">
          {config.branchName}
        </p>
        <img
          src={config.walkInQrUrl}
          alt="Walk-in QR"
          className="mx-auto h-48 w-48 border border-grid bg-panel object-contain"
        />
        <p className="mt-4 text-center font-mono text-xs uppercase tracking-widest text-graphite tabular">
          QR ONSITE CHECK-IN
        </p>
      </section>
    </div>
  );
}

export function OwnerAdminPage() {
  const { branchId: routeBranchId } = useParams<{ branchId?: string }>();

  if (!routeBranchId) {
    return <ClientPortfolioView />;
  }

  return <BranchSetupView branchId={routeBranchId} />;
}
