/**
 * Effective pause for a branch (Round 4 · M8): manual pause, outside opening
 * hours, or the longest bucket wait above `auto_pause_wait_mins`. All times are
 * Asia/Ho_Chi_Minh (UTC+7, no DST).
 */

export type PauseReason = 'MANUAL' | 'OUTSIDE_HOURS' | 'WAIT_TOO_LONG';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHhmm(v: unknown): v is string {
  return typeof v === 'string' && HHMM.test(v);
}

/** Minutes since local midnight in Vietnam. */
export function vnMinutesOfDay(nowMs: number): number {
  const d = new Date(nowMs + 7 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/** Inside [open, close). Supports overnight windows (e.g. 18:00–02:00). */
export function isWithinHours(open: string | null, close: string | null, nowMs: number): boolean {
  if (!isValidHhmm(open) || !isValidHhmm(close)) return true;
  const now = vnMinutesOfDay(nowMs);
  const o = toMin(open);
  const c = toMin(close);
  if (o === c) return true;
  return o < c ? now >= o && now < c : now >= o || now < c;
}

export function pauseReason(
  b: {
    is_paused: number;
    open_time?: string | null;
    close_time?: string | null;
    auto_pause_wait_mins?: number | null;
  },
  nowMs: number,
  maxBucketWaitMins = 0,
): PauseReason | null {
  if (b.is_paused === 1) return 'MANUAL';
  if (!isWithinHours(b.open_time ?? null, b.close_time ?? null, nowMs)) return 'OUTSIDE_HOURS';
  if (b.auto_pause_wait_mins && b.auto_pause_wait_mins > 0 && maxBucketWaitMins > b.auto_pause_wait_mins) {
    return 'WAIT_TOO_LONG';
  }
  return null;
}
