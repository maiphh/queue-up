/**
 * Manager floor — `/host/:branchId` (and `/manage/:branchId` via redirect).
 * Top metrics, pinned CALLED strip, waiting rows + Thêm drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { managerCopy } from '@luotdi/shared';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  LedIndicator,
  TabularMetric,
} from '@luotdi/ui-braun';
import {
  DEV_ACTOR_STORAGE_KEY,
  readDevActor,
} from '../../dev/actor';

type HostTicketStatus =
  | 'WAITING'
  | 'CALLED'
  | 'HELD'
  | 'SEATED'
  | 'CANCELLED';

type HostTicket = {
  id: string;
  displayNumber: string;
  status: HostTicketStatus;
  bucketId: string;
  paxCount: number;
  customerName: string;
  priorityBoost: number;
  createdAt: number;
  calledAt: number | null;
};

type HostSnapshot = {
  branchId: string;
  branchName: string;
  waitingCount: number;
  avgWaitMins: number;
  queueStatus: 'OPEN' | 'PAUSED' | 'CLOSED' | string;
  isPaused: boolean;
  tickets: HostTicket[];
  /** Present only when the snapshot already includes it. */
  industryType?: string;
};

const ACTION_ERROR = 'Không thực hiện được thao tác.';
const LOAD_ERROR = 'Không tải được hàng chờ.';
const WALK_IN_ERROR = 'Không tạo được số.';

function showAdminViewBanner(): boolean {
  // Avoid readDevActor() when unset — it persists PLATFORM_ADMIN and would
  // always show the banner in tests with empty sessionStorage.
  if (sessionStorage.getItem(DEV_ACTOR_STORAGE_KEY) == null) return false;
  return readDevActor().role === 'PLATFORM_ADMIN';
}

export function HostPosPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPax, setWalkInPax] = useState(2);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [drawerTicketId, setDrawerTicketId] = useState<string | null>(null);
  const [adminBanner] = useState(() => showAdminViewBanner());

  const loadSnapshot = useCallback(async () => {
    if (!branchId) return;
    try {
      const res = await fetch(`/api/branches/${branchId}/snapshot`);
      if (!res.ok) {
        setError(LOAD_ERROR);
        return;
      }
      const data = (await res.json()) as HostSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError(LOAD_ERROR);
    }
  }, [branchId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const waitingTickets = useMemo(
    () => (snapshot?.tickets ?? []).filter((t) => t.status === 'WAITING'),
    [snapshot],
  );

  const calledTickets = useMemo(
    () => (snapshot?.tickets ?? []).filter((t) => t.status === 'CALLED'),
    [snapshot],
  );

  const drawerTicket = useMemo(
    () => waitingTickets.find((t) => t.id === drawerTicketId) ?? null,
    [waitingTickets, drawerTicketId],
  );

  const isClinicOrHospital =
    snapshot?.industryType === 'CLINIC' ||
    snapshot?.industryType === 'HOSPITAL';
  const changeLabel = isClinicOrHospital
    ? managerCopy.changeService
    : managerCopy.changeParty;
  const guestNoun = isClinicOrHospital
    ? managerCopy.patientNoun
    : managerCopy.guestNoun;

  const pauseQueue = useCallback(async () => {
    if (!branchId) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/branches/${branchId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !(snapshot?.isPaused ?? false) }),
      });
      if (!res.ok) {
        setActionError(ACTION_ERROR);
        return;
      }
      await loadSnapshot();
    } catch {
      setActionError(ACTION_ERROR);
    }
  }, [branchId, snapshot?.isPaused, loadSnapshot]);

  const postTicketAction = useCallback(
    async (ticketId: string, action: string, extra: Record<string, unknown> = {}) => {
      setActionError(null);
      try {
        const res = await fetch(`/api/host/tickets/${ticketId}/action`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            // Local/dev staff auth until JWT lands
            'X-Test-Staff-Role': 'BRANCH_HOST',
          },
          body: JSON.stringify({ action, ...extra }),
        });
        if (!res.ok) {
          setActionError(ACTION_ERROR);
          return;
        }
        setDrawerTicketId(null);
        await loadSnapshot();
      } catch {
        setActionError(ACTION_ERROR);
      }
    },
    [loadSnapshot],
  );

  const submitWalkIn = useCallback(async () => {
    if (!branchId) return;
    const customerName = walkInName.trim();
    if (!customerName) {
      setActionError(WALK_IN_ERROR);
      return;
    }
    setWalkInSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          customerName,
          paxCount: walkInPax,
          source: 'HOST_MANUAL',
        }),
      });
      if (!res.ok) {
        setActionError(WALK_IN_ERROR);
        return;
      }
      setWalkInOpen(false);
      setWalkInName('');
      setWalkInPax(2);
      await loadSnapshot();
    } catch {
      setActionError(WALK_IN_ERROR);
    } finally {
      setWalkInSubmitting(false);
    }
  }, [branchId, walkInName, walkInPax, loadSnapshot]);

  if (!branchId) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">Thiếu chi nhánh.</p>
      </BraunChassis>
    );
  }

  if (error && !snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!snapshot) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-xs text-graphite tabular">Đang tải.</p>
      </BraunChassis>
    );
  }

  const isPaused =
    snapshot.isPaused ||
    snapshot.queueStatus === 'PAUSED' ||
    snapshot.queueStatus === managerCopy.statusPaused;
  const statusLabel = isPaused
    ? managerCopy.statusPaused
    : managerCopy.statusOpen;
  const ledState = isPaused
    ? 'warning'
    : snapshot.queueStatus === 'OPEN' || !isPaused
      ? 'active'
      : 'idle';

  return (
    <div
      data-page="host-pos"
      className="flex min-h-screen flex-col bg-chassis text-carbon"
    >
      {adminBanner ? (
        <p
          data-testid="admin-view-banner"
          className="border-b border-grid bg-ink px-4 py-2 font-mono text-xs text-panel tabular"
        >
          {managerCopy.adminViewBanner}
        </p>
      ) : null}

      <header
        data-testid="host-pos-top-bar"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-grid bg-panel px-4 py-3"
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            {managerCopy.eyebrow}
          </p>
          <h1 className="truncate font-sans text-base font-semibold text-carbon">
            {snapshot.branchName}
          </h1>
        </div>

        <div
          data-testid="host-pos-metrics"
          className="flex flex-wrap items-stretch gap-2"
        >
          <GridCell label={managerCopy.metricWaiting} className="min-w-[88px]">
            <TabularMetric size="lg" value={String(snapshot.waitingCount)} />
          </GridCell>
          <GridCell label={managerCopy.metricAvgWait} className="min-w-[88px]">
            <TabularMetric
              size="lg"
              value={`${snapshot.avgWaitMins} min`}
            />
          </GridCell>
          <GridCell label={managerCopy.metricStatus} className="min-w-[112px]">
            <div className="flex items-center gap-2">
              <LedIndicator state={ledState} />
              <span className="font-mono text-sm tracking-wide tabular">
                {statusLabel}
              </span>
            </div>
          </GridCell>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <KeycapButton variant="secondary" onClick={() => void pauseQueue()}>
            {isPaused ? managerCopy.resume : managerCopy.pause}
          </KeycapButton>
          <KeycapButton
            variant="primary"
            onClick={() => {
              setActionError(null);
              setWalkInOpen(true);
            }}
          >
            {managerCopy.walkIn}
          </KeycapButton>
        </div>
      </header>

      {actionError ? (
        <p
          data-testid="host-pos-action-error"
          className="border-b border-grid bg-panel px-4 py-2 text-sm text-carbon"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {calledTickets.length > 0 ? (
        <section
          data-testid="summoned-strip"
          className="border-b border-grid bg-ink px-4 py-3 text-panel"
        >
          <ul className="flex flex-col gap-2">
            {calledTickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-grid bg-chassis/10 px-3 py-2"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <TabularMetric
                    size="lg"
                    value={ticket.displayNumber}
                    className="text-panel"
                  />
                  <span className="truncate text-sm text-panel/80">
                    {ticket.customerName} / {ticket.paxCount} {guestNoun}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <KeycapButton
                    variant="primary"
                    onClick={() => void postTicketAction(ticket.id, 'SEAT')}
                  >
                    {managerCopy.seat}
                  </KeycapButton>
                  <KeycapButton
                    variant="secondary"
                    onClick={() => void postTicketAction(ticket.id, 'HOLD')}
                  >
                    {managerCopy.hold}
                  </KeycapButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        data-testid="waiting-ledger"
        className="flex-1 overflow-auto p-4"
      >
        {waitingTickets.length === 0 ? (
          <BraunChassis className="p-4">
            <p className="font-mono text-xs text-graphite tabular">
              Không có {guestNoun} đang chờ.
            </p>
          </BraunChassis>
        ) : (
          <ul className="flex flex-col gap-2">
            {waitingTickets.map((ticket) => (
              <li
                key={ticket.id}
                data-testid={`waiting-row-${ticket.id}`}
                className="flex flex-wrap items-center justify-between gap-3 border border-grid bg-panel px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <TabularMetric size="lg" value={ticket.displayNumber} />
                  <span className="truncate text-sm text-graphite">
                    {ticket.customerName} / {ticket.paxCount} {guestNoun}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <KeycapButton
                    variant="primary"
                    onClick={() => void postTicketAction(ticket.id, 'SUMMON')}
                  >
                    {managerCopy.summon}
                  </KeycapButton>
                  <KeycapButton
                    variant="secondary"
                    aria-label={managerCopy.more}
                    onClick={() => setDrawerTicketId(ticket.id)}
                  >
                    {managerCopy.more}
                  </KeycapButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {drawerTicket ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end bg-ink/40 sm:items-center sm:justify-center"
          role="presentation"
          onClick={() => setDrawerTicketId(null)}
        >
          <div
            data-testid="row-action-drawer"
            role="dialog"
            aria-label={managerCopy.more}
            className="w-full max-w-sm border border-grid bg-panel p-4 sm:w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
              {drawerTicket.displayNumber}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <KeycapButton
                variant="secondary"
                onClick={() =>
                  void postTicketAction(drawerTicket.id, 'BUMP_PRIORITY')
                }
              >
                {managerCopy.bump}
              </KeycapButton>
              <KeycapButton
                variant="secondary"
                onClick={() =>
                  void postTicketAction(drawerTicket.id, 'CHANGE_BUCKET', {
                    paxCount: Math.min(12, drawerTicket.paxCount + 1),
                  })
                }
              >
                {changeLabel}
              </KeycapButton>
              <KeycapButton
                variant="danger"
                onClick={() =>
                  void postTicketAction(drawerTicket.id, 'CANCEL')
                }
              >
                {managerCopy.cancel}
              </KeycapButton>
              <KeycapButton
                variant="secondary"
                onClick={() => setDrawerTicketId(null)}
              >
                {managerCopy.close}
              </KeycapButton>
            </div>
          </div>
        </div>
      ) : null}

      {walkInOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
          role="presentation"
          onClick={() => setWalkInOpen(false)}
        >
          <div
            data-testid="walk-in-modal"
            role="dialog"
            aria-label={managerCopy.walkIn}
            className="w-full max-w-md border border-grid bg-panel p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
              {managerCopy.walkIn}
            </p>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submitWalkIn();
              }}
            >
              <label className="flex flex-col gap-1 text-sm text-carbon">
                Tên {guestNoun}
                <input
                  type="text"
                  name="customerName"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  className="min-h-[48px] border border-grid bg-chassis px-3 font-sans text-sm text-carbon"
                  autoComplete="name"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-carbon">
                Số {guestNoun}
                <input
                  type="number"
                  name="paxCount"
                  min={1}
                  max={12}
                  value={walkInPax}
                  onChange={(e) =>
                    setWalkInPax(
                      Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                    )
                  }
                  className="min-h-[48px] border border-grid bg-chassis px-3 font-mono text-sm tabular text-carbon"
                />
              </label>
              <div className="mt-1 flex justify-end gap-2">
                <KeycapButton
                  variant="secondary"
                  type="button"
                  onClick={() => setWalkInOpen(false)}
                >
                  {managerCopy.close}
                </KeycapButton>
                <KeycapButton
                  variant="primary"
                  type="submit"
                  disabled={walkInSubmitting}
                >
                  {managerCopy.walkIn}
                </KeycapButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
