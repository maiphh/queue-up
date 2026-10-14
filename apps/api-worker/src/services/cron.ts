/**
 * Nightly reset & expired-hold sweeper (Phase 1.4).
 *
 * Cron: `0 21 * * *` → 04:00 AM Asia/Ho_Chi_Minh (UTC+7).
 */

import { transitionTicket, type TicketStatus } from '@luotdi/shared';

export type SweepExpiredHoldsResult = {
  cancelledCount: number;
};

export type DailyResetResult = {
  resetBuckets: number;
  cancelledTickets: number;
};

/** Calendar date YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7, no DST). */
function ticketDateVietnam(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

/**
 * Cancel HELD tickets whose grace window has elapsed:
 * `nowMs - held_at > branch.grace_period_mins * 60_000`.
 */
export async function sweepExpiredHolds(
  db: D1Database,
  nowMs: number = Date.now(),
): Promise<SweepExpiredHoldsResult> {
  const candidates = await db
    .prepare(
      `SELECT t.id AS id, t.status AS status, t.held_at AS held_at,
              b.grace_period_mins AS grace_period_mins
       FROM tickets t
       JOIN branches b ON b.id = t.branch_id
       WHERE t.status = 'HELD' AND t.held_at IS NOT NULL`,
    )
    .all<{
      id: string;
      status: string;
      held_at: number;
      grace_period_mins: number;
    }>();

  const expiredIds: string[] = [];
  for (const row of candidates.results ?? []) {
    if (nowMs - row.held_at > row.grace_period_mins * 60_000) {
      transitionTicket(row.status as TicketStatus, 'CANCELLED');
      expiredIds.push(row.id);
    }
  }

  if (expiredIds.length === 0) {
    return { cancelledCount: 0 };
  }

  await db.batch(
    expiredIds.map((id) =>
      db
        .prepare(
          `UPDATE tickets SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?`,
        )
        .bind(nowMs, id),
    ),
  );

  return { cancelledCount: expiredIds.length };
}

/**
 * Reset `queue_buckets.current_seq = 0` and cancel unclosed
 * WAITING / CALLED / HELD tickets whose `ticket_date` is before
 * today's calendar date in Asia/Ho_Chi_Minh.
 */
export async function dailyResetCron(
  db: D1Database,
  nowMs: number = Date.now(),
): Promise<DailyResetResult> {
  const today = ticketDateVietnam(nowMs);

  const resetResult = await db
    .prepare(`UPDATE queue_buckets SET current_seq = 0`)
    .run();
  const resetBuckets = resetResult.meta.changes ?? 0;

  const openPrior = await db
    .prepare(
      `SELECT id, status FROM tickets
       WHERE status IN ('WAITING', 'CALLED', 'HELD')
         AND ticket_date < ?`,
    )
    .bind(today)
    .all<{ id: string; status: string }>();

  const rows = openPrior.results ?? [];
  for (const row of rows) {
    transitionTicket(row.status as TicketStatus, 'CANCELLED');
  }

  if (rows.length > 0) {
    await db.batch(
      rows.map((row) =>
        db
          .prepare(
            `UPDATE tickets SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?`,
          )
          .bind(nowMs, row.id),
      ),
    );
  }

  return {
    resetBuckets,
    cancelledTickets: rows.length,
  };
}
