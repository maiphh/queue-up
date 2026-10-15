/** Pure helpers for the TV display (unit-tested). */

export type TvBucket = {
  id: string;
  prefix: string;
  labelVi: string;
  minPax: number;
  maxPax: number;
  partiesWaiting: number;
  estimatedWaitMins: number;
  next: string[];
};

export type TvNowServing = {
  displayNumber: string;
  bucketPrefix: string;
  bucketLabelVi: string;
  minPax: number;
  maxPax: number;
  calledAt: number;
};

export type TvSnapshot = {
  branchId: string;
  branchName: string;
  branchSlug: string;
  merchantName?: string;
  address?: string;
  district?: string;
  routingMode?: string;
  industryType?: string;
  isPaused?: boolean;
  servedToday?: number;
  walkInQrUrl: string;
  nowServing?: TvNowServing | null;
  recent?: { displayNumber: string; calledAt: number }[];
  buckets: TvBucket[];
  /** Round 4 · M8 settings (optional until the manager saves them). */
  tv?: { tts: boolean; chime: boolean; mascot: boolean; staticMode: boolean };
};

export type TvState = 'loading' | 'error' | 'live' | 'calling' | 'paused' | 'empty' | 'offline';

export const CALL_FLASH_MS = 6000;
export const ERROR_RETRY_MS = 30_000;
export const POLL_MS = 10_000;

export function isClinic(s: Pick<TvSnapshot, 'routingMode' | 'industryType'>): boolean {
  return s.industryType === 'CLINIC' || s.routingMode === 'SERVICE_TYPE';
}

/** "KHÁM TỔNG QUÁT" → "Khám tổng quát" (seed labels are upper-case). */
export function sentenceCase(label: string): string {
  const lower = label.toLocaleLowerCase('vi');
  return lower.charAt(0).toLocaleUpperCase('vi') + lower.slice(1);
}

/** Split "A·012" → ["A", "012"] (falls back to the whole string). */
export function splitNumber(displayNumber: string): [string, string] | null {
  const i = displayNumber.indexOf('\u00B7');
  if (i < 0) return null;
  return [displayNumber.slice(0, i), displayNumber.slice(i + 1)];
}

/** Retry delays for the offline state: 2s, 4s, 8s … capped at 30s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 2000 * 2 ** Math.max(0, attempt));
}

export function deriveTvState(args: {
  snapshot: TvSnapshot | null;
  notFound: boolean;
  failing: boolean;
  calling: boolean;
}): TvState {
  const { snapshot, notFound, failing, calling } = args;
  if (notFound) return 'error';
  if (!snapshot) return 'loading';
  if (failing) return 'offline';
  if (calling) return 'calling';
  if (snapshot.isPaused) return 'paused';
  const anyWaiting = snapshot.buckets.some((b) => b.partiesWaiting > 0);
  if (!snapshot.nowServing && !anyWaiting) return 'empty';
  return 'live';
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** Clock in Asia/Ho_Chi_Minh: { time: "12:05", date: "Thứ Năm, 15/10" }. */
export function vnClock(nowMs: number): { time: string; date: string } {
  const d = new Date(nowMs + 7 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { time: `${hh}:${mm}`, date: `${WEEKDAYS[d.getUTCDay()]}, ${dd}/${mo}` };
}
