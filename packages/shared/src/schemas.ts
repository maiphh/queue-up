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

/** Ticket intake channel. */
export const TicketSourceSchema = z.enum([
  'QR_ONSITE',
  'MARKETPLACE',
  'HOST_MANUAL',
]);
export type TicketSource = z.infer<typeof TicketSourceSchema>;

/** POST /api/tickets request body. */
export const CreateTicketRequestSchema = z.object({
  branchId: z.string().min(1),
  /** Required for PARTY_SIZE routing. */
  paxCount: z.number().int().positive().optional(),
  /** Required for SERVICE_TYPE routing. */
  bucketId: z.string().min(1).optional(),
  zaloUserId: z.string().min(1).optional(),
  customerName: z.string().min(1),
  source: TicketSourceSchema.optional(),
});
export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;

/** POST /api/tickets success body (status is always WAITING on create). */
export const CreateTicketResponseSchema = z.object({
  id: z.string().min(1),
  displayNumber: z.string().min(1),
  status: z.literal('WAITING'),
  bucketId: z.string().min(1),
  seqNumber: z.number().int().positive(),
  estimatedWaitMins: z.number().nonnegative().optional(),
});
export type CreateTicketResponse = z.infer<typeof CreateTicketResponseSchema>;

/** Stable API error codes for ticket issuance and related routes. */
export const ApiErrorCodeSchema = z.enum([
  'ACTIVE_TICKET_EXISTS',
  'QUEUE_PAUSED',
  'FREE_QUOTA_EXCEEDED',
  'NOT_IMPLEMENTED',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Standard error envelope: `{ error, code }`. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
