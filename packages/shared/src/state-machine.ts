import type {
  Bucket,
  CalculateEstimatedWaitInput,
  ResolveBucketInput,
  TicketStatus,
} from './schemas';

/**
 * Valid ticket status transitions (contract).
 * SEATED and CANCELLED are terminal.
 */
export const VALID_TRANSITIONS: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  WAITING: ['CALLED', 'CANCELLED'],
  CALLED: ['SEATED', 'HELD', 'CANCELLED'],
  HELD: ['CALLED', 'SEATED', 'CANCELLED'],
  SEATED: [],
  CANCELLED: [],
} as const;

export class InvalidTicketTransitionError extends Error {
  readonly from: TicketStatus;
  readonly to: TicketStatus;

  constructor(from: TicketStatus, to: TicketStatus) {
    super(`Invalid ticket transition: ${from} -> ${to}`);
    this.name = 'InvalidTicketTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Apply a ticket status transition. Throws InvalidTicketTransitionError if illegal. */
export function transitionTicket(
  _current: TicketStatus,
  _next: TicketStatus,
): TicketStatus {
  throw new Error('Not implemented');
}

/**
 * Resolve the target queue bucket.
 * PARTY_SIZE: match active bucket by paxCount against minPax/maxPax.
 * SERVICE_TYPE: select by bucketId regardless of paxCount.
 */
export function resolveBucket(_input: ResolveBucketInput): Bucket {
  throw new Error('Not implemented');
}

/**
 * estimated_wait_mins =
 *   Math.ceil((partiesAheadInBucket + 1) / activeCountersInBucket) * rollingTurnoverMins
 */
export function calculateEstimatedWait(
  _input: CalculateEstimatedWaitInput,
): number {
  throw new Error('Not implemented');
}
