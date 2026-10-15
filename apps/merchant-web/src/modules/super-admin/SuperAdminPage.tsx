/**
 * Platform Admin — `/admin`.
 * Overview of clients → brands → branches; onboard client; plan + force-clear.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminCopy,
  type IndustryType,
  type OnboardClientRequest,
  type PlanTier,
  type RoutingMode,
} from '@luotdi/shared';
import { KeycapButton, TabularMetric } from '@luotdi/ui-braun';

type OverviewBranch = {
  id: string;
  name: string;
  district: string;
  waitingCount: number;
  isPaused: boolean;
};

type OverviewBrand = {
  id: string;
  name: string;
  slug: string;
  industryType: string;
  planTier: PlanTier | string;
  walletBalanceVnd: number;
  branches: OverviewBranch[];
};

type OverviewClient = {
  id: string;
  name: string;
  brands: OverviewBrand[];
};

type Overview = {
  clients: OverviewClient[];
};

const INDUSTRY_OPTIONS: IndustryType[] = [
  'RESTAURANT',
  'CLINIC',
  'HOSPITAL',
  'SALON',
  'BANK',
  'CAFE',
];

const ROUTING_OPTIONS: RoutingMode[] = ['PARTY_SIZE', 'SERVICE_TYPE'];
const PLAN_OPTIONS: PlanTier[] = ['FREE', 'PRO'];

const EMPTY_FORM: OnboardClientRequest = {
  clientName: '',
  brandName: '',
  industryType: 'RESTAURANT',
  branchName: '',
  address: '',
  district: '',
  routingMode: 'PARTY_SIZE',
  planTier: 'FREE',
};

const FIELD_CLASS =
  'mt-1 block min-h-[48px] w-full border border-grid bg-chassis px-3 font-sans text-sm text-carbon rounded-none';

export function SuperAdminPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<OnboardClientRequest>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmClearBranchId, setConfirmClearBranchId] = useState<
    string | null
  >(null);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) {
        setError('Không tải được danh sách.');
        return;
      }
      const data = (await res.json()) as Overview;
      setOverview(data);
      setError(null);
    } catch {
      setError('Không tải được danh sách.');
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const setPlanTier = useCallback(
    async (merchantId: string, planTier: PlanTier) => {
      try {
        const res = await fetch(
          `/api/super-admin/merchants/${merchantId}/plan`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchantId, planTier }),
          },
        );
        if (!res.ok) {
          setError('Không đổi được gói.');
          return;
        }
        await loadOverview();
      } catch {
        setError('Không đổi được gói.');
      }
    },
    [loadOverview],
  );

  const forceClear = useCallback(
    async (branchId: string) => {
      try {
        const res = await fetch(
          `/api/super-admin/branches/${branchId}/force-clear`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branchId }),
          },
        );
        if (!res.ok) {
          setError('Không xóa được hàng chờ.');
          return;
        }
        setConfirmClearBranchId(null);
        await loadOverview();
      } catch {
        setError('Không xóa được hàng chờ.');
      }
    },
    [loadOverview],
  );

  const submitOnboard = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          setError('Không thêm được client.');
          return;
        }
        setShowForm(false);
        setForm(EMPTY_FORM);
        setError(null);
        await loadOverview();
      } catch {
        setError('Không thêm được client.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, loadOverview],
  );

  const updateField = useCallback(
    <K extends keyof OnboardClientRequest>(
      key: K,
      value: OnboardClientRequest[K],
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <div
      data-page="admin"
      className="flex min-h-screen flex-col bg-chassis text-carbon"
    >
      <section
        data-testid="super-admin-panel"
        className="m-4 border border-grid bg-panel p-4"
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-grid pb-3">
          <h1 className="font-sans text-base font-semibold tracking-wide text-carbon">
            {adminCopy.title}
          </h1>
          <KeycapButton
            variant="primary"
            onClick={() => {
              setShowForm((open) => !open);
              setError(null);
            }}
          >
            {adminCopy.addClient}
          </KeycapButton>
        </header>

        {error ? (
          <p className="mb-3 font-sans text-sm text-carbon">{error}</p>
        ) : null}

        {showForm ? (
          <form
            data-testid="onboard-form"
            className="mb-4 border border-grid bg-chassis p-3"
            onSubmit={(e) => void submitOnboard(e)}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                clientName
                <input
                  className={FIELD_CLASS}
                  value={form.clientName}
                  onChange={(e) => updateField('clientName', e.target.value)}
                  required
                />
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                brandName
                <input
                  className={FIELD_CLASS}
                  value={form.brandName}
                  onChange={(e) => updateField('brandName', e.target.value)}
                  required
                />
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                industryType
                <select
                  className={FIELD_CLASS}
                  value={form.industryType}
                  onChange={(e) =>
                    updateField('industryType', e.target.value as IndustryType)
                  }
                >
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                branchName
                <input
                  className={FIELD_CLASS}
                  value={form.branchName}
                  onChange={(e) => updateField('branchName', e.target.value)}
                  required
                />
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                address
                <input
                  className={FIELD_CLASS}
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  required
                />
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                district
                <input
                  className={FIELD_CLASS}
                  value={form.district}
                  onChange={(e) => updateField('district', e.target.value)}
                  required
                />
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                routingMode
                <select
                  className={FIELD_CLASS}
                  value={form.routingMode}
                  onChange={(e) =>
                    updateField('routingMode', e.target.value as RoutingMode)
                  }
                >
                  {ROUTING_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
                planTier
                <select
                  className={FIELD_CLASS}
                  value={form.planTier}
                  onChange={(e) =>
                    updateField('planTier', e.target.value as PlanTier)
                  }
                >
                  {PLAN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3">
              <KeycapButton
                type="submit"
                variant="primary"
                disabled={submitting}
              >
                {adminCopy.addClient}
              </KeycapButton>
            </div>
          </form>
        ) : null}

        {!overview && !error ? (
          <p className="font-sans text-sm text-carbon">Đang tải...</p>
        ) : null}

        {overview ? (
          <div data-testid="client-list" className="flex flex-col gap-4">
            {overview.clients.map((client) => (
              <article
                key={client.id}
                data-testid={`client-${client.id}`}
                className="border border-grid bg-chassis p-3"
              >
                <h2 className="font-sans text-sm font-semibold text-carbon">
                  {client.name}
                </h2>

                <div className="mt-3 flex flex-col gap-3">
                  {client.brands.map((brand) => {
                    const nextTier: PlanTier =
                      brand.planTier === 'PRO' ? 'FREE' : 'PRO';
                    return (
                      <div
                        key={brand.id}
                        data-testid={`brand-${brand.id}`}
                        className="border border-grid bg-panel p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-sans text-sm font-semibold text-carbon">
                              {brand.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="border border-grid bg-chassis px-2 py-0.5 font-mono text-xs uppercase tabular">
                                {brand.planTier}
                              </span>
                            </div>
                          </div>
                          <KeycapButton
                            variant="secondary"
                            onClick={() =>
                              void setPlanTier(brand.id, nextTier)
                            }
                          >
                            {adminCopy.changePlan}
                          </KeycapButton>
                        </div>

                        <div className="mt-3 flex flex-col gap-2">
                          {brand.branches.map((branch) => (
                            <div
                              key={branch.id}
                              data-testid={`branch-row-${branch.id}`}
                              className="flex flex-wrap items-center justify-between gap-3 border border-grid bg-chassis px-3 py-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-sans text-sm font-semibold text-carbon">
                                  {branch.name}
                                </p>
                                <p className="mt-1 font-mono text-xs text-graphite tabular">
                                  chờ{' '}
                                  <TabularMetric
                                    size="md"
                                    value={String(branch.waitingCount)}
                                  />
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <KeycapButton
                                  variant="secondary"
                                  onClick={() =>
                                    navigate(`/manage/${branch.id}`)
                                  }
                                >
                                  {adminCopy.openFloor}
                                </KeycapButton>
                                {confirmClearBranchId === branch.id ? (
                                  <KeycapButton
                                    variant="danger"
                                    onClick={() => void forceClear(branch.id)}
                                  >
                                    {adminCopy.confirmClear}
                                  </KeycapButton>
                                ) : (
                                  <KeycapButton
                                    variant="secondary"
                                    onClick={() =>
                                      setConfirmClearBranchId(branch.id)
                                    }
                                  >
                                    {adminCopy.clearQueue}
                                  </KeycapButton>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
