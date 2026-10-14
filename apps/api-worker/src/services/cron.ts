/**
 * Nightly reset & expired-hold sweeper (Phase 1.4).
 * RED stubs — GREEN implements against D1.
 *
 * Cron: `0 21 * * *` → 04:00 AM Asia/Ho_Chi_Minh (UTC+7).
 */

export type SweepExpiredHoldsResult = {
  cancelledCount: number;
};

export type DailyResetResult = {
  resetBuckets: number;
  cancelledTickets: number;
};

/**
 * Cancel HELD tickets whose grace window has elapsed:
 * `nowMs - held_at > branch.grace_period_mins * 60_000`.
 */
export async function sweepExpiredHolds(
  _db: D1Database,
  _nowMs: number = Date.now(),
): Promise<SweepExpiredHoldsResult> {
  throw new Error('Not implemented');
}

/**
 * Reset `queue_buckets.current_seq = 0` and cancel unclosed
 * WAITING / CALLED / HELD tickets whose `ticket_date` is before
 * today's calendar date in Asia/Ho_Chi_Minh.
 */
export async function dailyResetCron(
  _db: D1Database,
  _nowMs: number = Date.now(),
): Promise<DailyResetResult> {
  throw new Error('Not implemented');
}
