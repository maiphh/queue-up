import { describe, expect, it } from 'vitest';
import type { Bucket } from '../src';
import {
  calculateEstimatedWait,
  InvalidTicketTransitionError,
  resolveBucket,
  transitionTicket,
  VALID_TRANSITIONS,
} from '../src';

/** Fixture buckets: A=1–2, B=3–4, C=5–12 (PARTY_SIZE restaurant defaults). */
const FIXTURE_BUCKETS: Bucket[] = [
  {
    id: 'bucket-a',
    branchId: 'branch-1',
    prefix: 'A',
    labelVi: '01-02 KHÁCH',
    labelEn: '01-02 GUESTS',
    minPax: 1,
    maxPax: 2,
    activeCounters: 4,
    rollingTurnoverMins: 20,
    currentSeq: 0,
    isActive: true,
  },
  {
    id: 'bucket-b',
    branchId: 'branch-1',
    prefix: 'B',
    labelVi: '03-04 KHÁCH',
    labelEn: '03-04 GUESTS',
    minPax: 3,
    maxPax: 4,
    activeCounters: 3,
    rollingTurnoverMins: 25,
    currentSeq: 0,
    isActive: true,
  },
  {
    id: 'bucket-c',
    branchId: 'branch-1',
    prefix: 'C',
    labelVi: '05-12 KHÁCH',
    labelEn: '05-12 GUESTS',
    minPax: 5,
    maxPax: 12,
    activeCounters: 2,
    rollingTurnoverMins: 35,
    currentSeq: 0,
    isActive: true,
  },
];

describe('transitionTicket — valid transitions', () => {
  it('WAITING -> CALLED', () => {
    expect(transitionTicket('WAITING', 'CALLED')).toBe('CALLED');
  });

  it('CALLED -> HELD', () => {
    expect(transitionTicket('CALLED', 'HELD')).toBe('HELD');
  });

  it('HELD -> SEATED', () => {
    expect(transitionTicket('HELD', 'SEATED')).toBe('SEATED');
  });

  it('WAITING -> CANCELLED', () => {
    expect(transitionTicket('WAITING', 'CANCELLED')).toBe('CANCELLED');
  });

  it('CALLED -> SEATED', () => {
    expect(transitionTicket('CALLED', 'SEATED')).toBe('SEATED');
  });

  it('CALLED -> CANCELLED', () => {
    expect(transitionTicket('CALLED', 'CANCELLED')).toBe('CANCELLED');
  });

  it('HELD -> CALLED (re-summon)', () => {
    expect(transitionTicket('HELD', 'CALLED')).toBe('CALLED');
  });

  it('HELD -> CANCELLED', () => {
    expect(transitionTicket('HELD', 'CANCELLED')).toBe('CANCELLED');
  });

  it('covers every edge in VALID_TRANSITIONS', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of tos) {
        expect(transitionTicket(from as keyof typeof VALID_TRANSITIONS, to)).toBe(
          to,
        );
      }
    }
  });
});

describe('transitionTicket — illegal transitions', () => {
  it('SEATED -> WAITING throws InvalidTicketTransitionError', () => {
    expect(() => transitionTicket('SEATED', 'WAITING')).toThrow(
      InvalidTicketTransitionError,
    );
  });

  it('WAITING -> HELD throws InvalidTicketTransitionError', () => {
    expect(() => transitionTicket('WAITING', 'HELD')).toThrow(
      InvalidTicketTransitionError,
    );
  });

  it('CANCELLED -> CALLED throws InvalidTicketTransitionError', () => {
    expect(() => transitionTicket('CANCELLED', 'CALLED')).toThrow(
      InvalidTicketTransitionError,
    );
  });

  it('SEATED -> CALLED throws InvalidTicketTransitionError', () => {
    expect(() => transitionTicket('SEATED', 'CALLED')).toThrow(
      InvalidTicketTransitionError,
    );
  });

  it('SEATED and CANCELLED are terminal (no outgoing edges)', () => {
    expect(VALID_TRANSITIONS.SEATED).toEqual([]);
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('error includes from/to on InvalidTicketTransitionError', () => {
    try {
      transitionTicket('SEATED', 'WAITING');
      expect.unreachable('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTicketTransitionError);
      const e = err as InvalidTicketTransitionError;
      expect(e.from).toBe('SEATED');
      expect(e.to).toBe('WAITING');
    }
  });
});

describe('resolveBucket — PARTY_SIZE mode', () => {
  it('party size 1 routes to Bucket A', () => {
    const bucket = resolveBucket({
      routingMode: 'PARTY_SIZE',
      paxCount: 1,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.prefix).toBe('A');
    expect(bucket.id).toBe('bucket-a');
  });

  it('party size 2 routes to Bucket A', () => {
    const bucket = resolveBucket({
      routingMode: 'PARTY_SIZE',
      paxCount: 2,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.prefix).toBe('A');
  });

  it('party size 3 routes to Bucket B', () => {
    const bucket = resolveBucket({
      routingMode: 'PARTY_SIZE',
      paxCount: 3,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.prefix).toBe('B');
  });

  it('party size 4 routes to Bucket B', () => {
    const bucket = resolveBucket({
      routingMode: 'PARTY_SIZE',
      paxCount: 4,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.prefix).toBe('B');
  });

  it.each([5, 6, 8, 12])('party size %i routes to Bucket C', (paxCount) => {
    const bucket = resolveBucket({
      routingMode: 'PARTY_SIZE',
      paxCount,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.prefix).toBe('C');
    expect(bucket.id).toBe('bucket-c');
  });
});

describe('resolveBucket — SERVICE_TYPE mode', () => {
  it('routes by bucketId regardless of paxCount (small party -> C)', () => {
    const bucket = resolveBucket({
      routingMode: 'SERVICE_TYPE',
      bucketId: 'bucket-c',
      paxCount: 1,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.id).toBe('bucket-c');
    expect(bucket.prefix).toBe('C');
  });

  it('routes by bucketId regardless of paxCount (large party -> A)', () => {
    const bucket = resolveBucket({
      routingMode: 'SERVICE_TYPE',
      bucketId: 'bucket-a',
      paxCount: 10,
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.id).toBe('bucket-a');
    expect(bucket.prefix).toBe('A');
  });

  it('selects explicit bucket B when requested', () => {
    const bucket = resolveBucket({
      routingMode: 'SERVICE_TYPE',
      bucketId: 'bucket-b',
      buckets: FIXTURE_BUCKETS,
    });
    expect(bucket.id).toBe('bucket-b');
  });
});

describe('calculateEstimatedWait', () => {
  it('0 ahead, 1 counter, 20 min turnover → 20', () => {
    expect(
      calculateEstimatedWait({
        partiesAheadInBucket: 0,
        activeCountersInBucket: 1,
        rollingTurnoverMins: 20,
      }),
    ).toBe(20);
  });

  it('3 ahead, 2 counters, 15 min turnover → 30', () => {
    // ceil((3+1)/2) * 15 = 2 * 15 = 30
    expect(
      calculateEstimatedWait({
        partiesAheadInBucket: 3,
        activeCountersInBucket: 2,
        rollingTurnoverMins: 15,
      }),
    ).toBe(30);
  });

  it('5 ahead, 4 counters, 20 min turnover → 40', () => {
    // ceil((5+1)/4) * 20 = 2 * 20 = 40
    expect(
      calculateEstimatedWait({
        partiesAheadInBucket: 5,
        activeCountersInBucket: 4,
        rollingTurnoverMins: 20,
      }),
    ).toBe(40);
  });

  it('0 ahead, 4 counters, 20 min turnover → 20', () => {
    // ceil((0+1)/4) * 20 = 1 * 20 = 20
    expect(
      calculateEstimatedWait({
        partiesAheadInBucket: 0,
        activeCountersInBucket: 4,
        rollingTurnoverMins: 20,
      }),
    ).toBe(20);
  });

  it('7 ahead, 3 counters, 25 min turnover → 75', () => {
    // ceil((7+1)/3) * 25 = 3 * 25 = 75
    expect(
      calculateEstimatedWait({
        partiesAheadInBucket: 7,
        activeCountersInBucket: 3,
        rollingTurnoverMins: 25,
      }),
    ).toBe(75);
  });
});
