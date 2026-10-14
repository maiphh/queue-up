import { z } from 'zod';

/** Ticket lifecycle statuses — SEATED and CANCELLED are terminal. */
export const TicketStatusSchema = z.enum([
  'WAITING',
  'CALLED',
  'HELD',
  'SEATED',
  'CANCELLED',
]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const RoutingModeSchema = z.enum(['PARTY_SIZE', 'SERVICE_TYPE']);
export type RoutingMode = z.infer<typeof RoutingModeSchema>;

/** Queue bucket shape used by routing and wait estimation (camelCase TS contract). */
export const BucketSchema = z.object({
  id: z.string().min(1),
  branchId: z.string().min(1),
  prefix: z.string().min(1),
  labelVi: z.string(),
  labelEn: z.string(),
  minPax: z.number().int().positive(),
  maxPax: z.number().int().positive(),
  activeCounters: z.number().int().positive(),
  rollingTurnoverMins: z.number().positive(),
  currentSeq: z.number().int().nonnegative(),
  isActive: z.boolean(),
});
export type Bucket = z.infer<typeof BucketSchema>;

export const ResolveBucketInputSchema = z.object({
  routingMode: RoutingModeSchema,
  buckets: z.array(BucketSchema).min(1),
  /** Required for PARTY_SIZE: select bucket where minPax <= paxCount <= maxPax. */
  paxCount: z.number().int().positive().optional(),
  /** Required for SERVICE_TYPE: select by explicit bucket id. */
  bucketId: z.string().min(1).optional(),
});
export type ResolveBucketInput = z.infer<typeof ResolveBucketInputSchema>;

export const CalculateEstimatedWaitInputSchema = z.object({
  partiesAheadInBucket: z.number().int().nonnegative(),
  activeCountersInBucket: z.number().int().positive(),
  rollingTurnoverMins: z.number().positive(),
});
export type CalculateEstimatedWaitInput = z.infer<
  typeof CalculateEstimatedWaitInputSchema
>;
