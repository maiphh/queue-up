/**
 * Live queue pass — `/ticket/:ticketId`.
 * Giant readout, metric strip, YOUR_TURN_CALLED chassis flip.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { guestCopy, type WsServerEvent } from '@luotdi/shared';
import {
  BraunChassis,
  GridCell,
  TabularMetric,
} from '@luotdi/ui-braun';
import { useQueueSocket } from '../hooks/useQueueSocket';
import { apiFetch } from '../lib/api';

type TicketPayload = {
  id: string;
  displayNumber: string;
  status: string;
  branchId: string;
  branchName: string;
  bucketId: string;
  paxCount: number;
  nowServing: string;
  partiesAhead: number;
  estimatedWaitMins: number;
};

export function LivePassPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<TicketPayload | null>(null);
  const [yourTurn, setYourTurn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(`/api/tickets/${ticketId}`);
        if (!res.ok) {
          if (!cancelled) setError('Không tìm thấy số.');
          return;
        }
        const data = (await res.json()) as TicketPayload;
        if (!cancelled) setTicket(data);
      } catch {
        if (!cancelled) setError('Không tải được số.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const onEvent = useCallback(
    (event: WsServerEvent) => {
      if (
        event.type === 'YOUR_TURN_CALLED' &&
        event.ticketId === ticketId
      ) {
        setYourTurn(true);
      }
    },
    [ticketId],
  );

  useQueueSocket({
    branchId: ticket?.branchId,
    ticketId,
    onEvent,
  });

  if (error && !ticket) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-sm text-carbon">{error}</p>
      </BraunChassis>
    );
  }

  if (!ticket) {
    return (
      <BraunChassis className="m-4 p-4">
        <p className="font-mono text-xs text-graphite tabular">Đang tải.</p>
      </BraunChassis>
    );
  }

  return (
    <div data-testid="live-pass" className="m-4 flex flex-col gap-3">
      <div
        data-testid="live-pass-chassis"
        data-braun="chassis"
        className={
          yourTurn
            ? 'border border-grid rounded-none bg-signal-orange p-6 text-panel'
            : 'border border-grid rounded-none bg-ink p-6 text-panel'
        }
      >
        <p className="font-mono text-[10px] uppercase tracking-widest tabular opacity-80">
          {ticket.branchName}
        </p>
        <div data-testid="ticket-display-number" className="mt-3">
          <TabularMetric
            size="display"
            value={ticket.displayNumber}
            className="text-panel"
          />
        </div>
        {yourTurn ? (
          <p className="mt-4 font-sans text-sm font-semibold tracking-wide">
            {guestCopy.proceed}
          </p>
        ) : null}
      </div>

      <div
        data-testid="live-pass-metrics"
        className="grid grid-cols-3 border border-grid"
      >
        <GridCell
          label={guestCopy.nowServing}
          className="border-0 border-r border-grid"
        >
          <TabularMetric size="lg" value={ticket.nowServing} />
        </GridCell>
        <GridCell
          label={guestCopy.ahead}
          className="border-0 border-r border-grid"
        >
          <TabularMetric size="lg" value={String(ticket.partiesAhead)} />
        </GridCell>
        <GridCell label={guestCopy.estWait} className="border-0">
          <TabularMetric
            size="lg"
            value={`${ticket.estimatedWaitMins} min`}
          />
        </GridCell>
      </div>
    </div>
  );
}
