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
  current: TicketStatus,
  next: TicketStatus,
): TicketStatus {
  if ((VALID_TRANSITIONS[current] as readonly TicketStatus[]).includes(next)) {
    return next;
  }
  throw new InvalidTicketTransitionError(current, next);
}

/**
 * Resolve the target queue bucket.
 * PARTY_SIZE: match active bucket by paxCount against minPax/maxPax.
 * SERVICE_TYPE: select by bucketId regardless of paxCount.
 */
export function resolveBucket(input: ResolveBucketInput): Bucket {
  const { routingMode, buckets, paxCount, bucketId } = input;

  if (routingMode === 'PARTY_SIZE') {
    if (paxCount === undefined) {
      throw new Error('paxCount is required for PARTY_SIZE routing');
    }
    const match = buckets.find(
      (b) => b.isActive && b.minPax <= paxCount && b.maxPax >= paxCount,
    );
    if (!match) {
      throw new Error(`No active bucket matches party size ${paxCount}`);
    }
    return match;
  }

  if (bucketId === undefined) {
    throw new Error('bucketId is required for SERVICE_TYPE routing');
  }
  const bucket = buckets.find((b) => b.id === bucketId);
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }
  if (!bucket.isActive) {
    throw new Error(`Bucket is inactive: ${bucketId}`);
  }
  return bucket;
}

/**
 * estimated_wait_mins =
 *   Math.ceil((partiesAheadInBucket + 1) / activeCountersInBucket) * rollingTurnoverMins
 */
export function calculateEstimatedWait(
  input: CalculateEstimatedWaitInput,
): number {
  const { partiesAheadInBucket, activeCountersInBucket, rollingTurnoverMins } =
    input;
  return (
    Math.ceil((partiesAheadInBucket + 1) / activeCountersInBucket) *
    rollingTurnoverMins
  );
}
