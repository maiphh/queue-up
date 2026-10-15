import {
  InvalidTicketTransitionError,
  transitionTicket,
  type BranchQueueBroadcastRequest,
  type HostTicketActionRequest,
  type HostTicketActionResponse,
  type TicketStatus,
} from '@luotdi/shared';
import { ZnsDispatcherService, type ZnsSender } from './zns-dispatcher';

type TicketRow = {
  id: string;
  branch_id: string;
  bucket_id: string;
  display_number: string;
  pax_count: number;
  status: string;
  priority_boost: number;
  created_at: number;
  called_at: number | null;
  held_at: number | null;
  seated_at: number | null;
  cancelled_at: number | null;
};

export type HostActionFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type HostActionSuccess = {
  ok: true;
  data: HostTicketActionResponse;
};

export type HostActionResult = HostActionSuccess | HostActionFailure;

function fail(
  status: number,
  code: string,
  error: string,
): HostActionFailure {
  return { ok: false, status, code, error };
}

function toResponse(row: TicketRow): HostTicketActionResponse {
  return {
    id: row.id,
    displayNumber: row.display_number,
    status: row.status as TicketStatus,
    bucketId: row.bucket_id,
    paxCount: row.pax_count,
    priorityBoost: row.priority_boost,
    createdAt: row.created_at,
    calledAt: row.called_at ?? undefined,
    heldAt: row.held_at ?? undefined,
    seatedAt: row.seated_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
  };
}

/** Host ad-hoc ticket mutations (SUMMON / HOLD / SEAT / BUMP / CHANGE_BUCKET / CANCEL). */
export class HostQueueService {
  constructor(
    private readonly db: D1Database,
    private readonly branchQueueRoom?: DurableObjectNamespace,
    private readonly znsSender?: ZnsSender,
  ) {}

  async applyAction(
    ticketId: string,
    req: HostTicketActionRequest,
  ): Promise<HostActionResult> {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) {
      return fail(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    }

    switch (req.action) {
      case 'SUMMON':
        return this.summon(ticket);
      case 'HOLD':
        return this.hold(ticket);
      case 'SEAT':
        return this.seat(ticket);
      case 'BUMP_PRIORITY':
        return this.bumpPriority(ticket);
      case 'CHANGE_BUCKET':
        return this.changeBucket(ticket, req);
      case 'CANCEL':
        return this.cancel(ticket);
      default: {
        const _exhaustive: never = req.action;
        return fail(400, 'INVALID_BODY', `Unknown action: ${_exhaustive}`);
      }
    }
  }

  private async getTicket(id: string): Promise<TicketRow | null> {
    return this.db
      .prepare(
        `SELECT id, branch_id, bucket_id, display_number, pax_count, status,
                priority_boost, created_at, called_at, held_at, seated_at, cancelled_at
         FROM tickets WHERE id = ?`,
      )
      .bind(id)
      .first<TicketRow>();
  }

  /** Returns next status, or failure for illegal transitions. */
  private tryTransition(
    from: string,
    to: TicketStatus,
  ): { ok: true; status: TicketStatus } | HostActionFailure {
    try {
      return { ok: true, status: transitionTicket(from as TicketStatus, to) };
    } catch (err) {
      const message =
        err instanceof InvalidTicketTransitionError
          ? err.message
          : err instanceof Error
            ? err.message
            : `Invalid ticket transition: ${from} -> ${to}`;
      return fail(409, 'INVALID_TRANSITION', message);
    }
  }

  private async summon(ticket: TicketRow): Promise<HostActionResult> {
    const next = this.tryTransition(ticket.status, 'CALLED');
    if (!next.ok) return next;

    const calledAt = Date.now();
    await this.db
      .prepare(
        `UPDATE tickets SET status = 'CALLED', called_at = ? WHERE id = ?`,
      )
      .bind(calledAt, ticket.id)
      .run();

    await this.notifyBranchRoom({
      type: 'SUMMON',
      branchId: ticket.branch_id,
      ticketId: ticket.id,
      displayNumber: ticket.display_number,
      status: 'CALLED',
      at: calledAt,
    });

    return {
      ok: true,
      data: toResponse({ ...ticket, status: 'CALLED', called_at: calledAt }),
    };
  }

  /** Fan-out QUEUE_UPDATED / YOUR_TURN_CALLED via BranchQueueRoom DO. */
  private async notifyBranchRoom(
    body: BranchQueueBroadcastRequest,
  ): Promise<void> {
    if (!this.branchQueueRoom) return;
    try {
      const id = this.branchQueueRoom.idFromName(body.branchId);
      const stub = this.branchQueueRoom.get(id);
      await stub.fetch('https://branch-queue-room/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* do not fail host action if WS fan-out fails */
    }
  }

  private async hold(ticket: TicketRow): Promise<HostActionResult> {
    const next = this.tryTransition(ticket.status, 'HELD');
    if (!next.ok) return next;

    const heldAt = Date.now();
    await this.db
      .prepare(
        `UPDATE tickets SET status = 'HELD', held_at = ? WHERE id = ?`,
      )
      .bind(heldAt, ticket.id)
      .run();

    return {
      ok: true,
      data: toResponse({ ...ticket, status: 'HELD', held_at: heldAt }),
    };
  }

  private async seat(ticket: TicketRow): Promise<HostActionResult> {
    const next = this.tryTransition(ticket.status, 'SEATED');
    if (!next.ok) return next;

    const seatedAt = Date.now();
    // created_at / seated_at are epoch ms (same as POST /api/tickets Date.now()).
    const actualWaitMins = (seatedAt - ticket.created_at) / 60_000;

    const statements = [
      this.db
        .prepare(
          `UPDATE tickets SET status = 'SEATED', seated_at = ? WHERE id = ?`,
        )
        .bind(seatedAt, ticket.id),
    ];

    if (actualWaitMins >= 2 && actualWaitMins <= 180) {
      const bucket = await this.db
        .prepare(
          `SELECT rolling_turnover_mins AS t FROM queue_buckets WHERE id = ?`,
        )
        .bind(ticket.bucket_id)
        .first<{ t: number }>();

      if (bucket) {
        const rolling = Math.round(0.7 * bucket.t + 0.3 * actualWaitMins);
        statements.push(
          this.db
            .prepare(
              `UPDATE queue_buckets SET rolling_turnover_mins = ? WHERE id = ?`,
            )
            .bind(rolling, ticket.bucket_id),
        );
      }
    }

    await this.db.batch(statements);

    // ApproachingTurn ZNS (prepaid wallet). Failures must not fail SEAT.
    try {
      await new ZnsDispatcherService(this.db, this.znsSender).onTicketSeated(
        ticket.id,
      );
    } catch {
      /* wallet/ZNS side-effects are best-effort */
    }

    return {
      ok: true,
      data: toResponse({ ...ticket, status: 'SEATED', seated_at: seatedAt }),
    };
  }

  private async bumpPriority(ticket: TicketRow): Promise<HostActionResult> {
    if (ticket.status !== 'WAITING') {
      return fail(
        409,
        'INVALID_TRANSITION',
        `BUMP_PRIORITY requires WAITING status, got ${ticket.status}`,
      );
    }

    const maxRow = await this.db
      .prepare(
        `SELECT COALESCE(MAX(priority_boost), 0) AS m
         FROM tickets WHERE bucket_id = ?`,
      )
      .bind(ticket.bucket_id)
      .first<{ m: number }>();

    const nextBoost = (maxRow?.m ?? 0) + 1;

    await this.db
      .prepare(`UPDATE tickets SET priority_boost = ? WHERE id = ?`)
      .bind(nextBoost, ticket.id)
      .run();

    return {
      ok: true,
      data: toResponse({ ...ticket, priority_boost: nextBoost }),
    };
  }

  private async changeBucket(
    ticket: TicketRow,
    req: HostTicketActionRequest,
  ): Promise<HostActionResult> {
    if (ticket.status !== 'WAITING') {
      return fail(
        409,
        'INVALID_TRANSITION',
        `CHANGE_BUCKET requires WAITING status, got ${ticket.status}`,
      );
    }

    const paxCount = req.paxCount ?? ticket.pax_count;
    let bucketId = req.bucketId ?? ticket.bucket_id;

    if (req.bucketId) {
      const target = await this.db
        .prepare(
          `SELECT id FROM queue_buckets
           WHERE id = ? AND branch_id = ? AND is_active = 1`,
        )
        .bind(req.bucketId, ticket.branch_id)
        .first<{ id: string }>();

      if (!target) {
        return fail(404, 'BUCKET_NOT_FOUND', 'Bucket not found');
      }
      bucketId = target.id;
    } else if (req.paxCount !== undefined) {
      const match = await this.db
        .prepare(
          `SELECT id FROM queue_buckets
           WHERE branch_id = ? AND is_active = 1
             AND min_pax <= ? AND max_pax >= ?
           LIMIT 1`,
        )
        .bind(ticket.branch_id, req.paxCount, req.paxCount)
        .first<{ id: string }>();

      if (!match) {
        return fail(
          400,
          'BUCKET_RESOLVE_FAILED',
          `No active bucket matches party size ${req.paxCount}`,
        );
      }
      bucketId = match.id;
    }

    // Preserve display_number and created_at (seniority + guest-facing code).
    await this.db
      .prepare(
        `UPDATE tickets SET bucket_id = ?, pax_count = ? WHERE id = ?`,
      )
      .bind(bucketId, paxCount, ticket.id)
      .run();

    return {
      ok: true,
      data: toResponse({
        ...ticket,
        bucket_id: bucketId,
        pax_count: paxCount,
      }),
    };
  }

  private async cancel(ticket: TicketRow): Promise<HostActionResult> {
    const next = this.tryTransition(ticket.status, 'CANCELLED');
    if (!next.ok) return next;

    const cancelledAt = Date.now();
    await this.db
      .prepare(
        `UPDATE tickets SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?`,
      )
      .bind(cancelledAt, ticket.id)
      .run();

    return {
      ok: true,
      data: toResponse({
        ...ticket,
        status: 'CANCELLED',
        cancelled_at: cancelledAt,
      }),
    };
  }
}
