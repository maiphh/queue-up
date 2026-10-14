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
  'INVALID_TRANSITION',
  'INVALID_BODY',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Standard error envelope: `{ error, code }`. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Host ad-hoc mutations on a ticket (`PATCH /api/host/tickets/:id/action`). */
export const HostTicketActionSchema = z.enum([
  'SUMMON',
  'HOLD',
  'SEAT',
  'BUMP_PRIORITY',
  'CHANGE_BUCKET',
  'CANCEL',
]);
export type HostTicketAction = z.infer<typeof HostTicketActionSchema>;

/**
 * PATCH /api/host/tickets/:id/action request body.
 * CHANGE_BUCKET requires `paxCount` and/or `bucketId`.
 */
export const HostTicketActionRequestSchema = z
  .object({
    action: HostTicketActionSchema,
    /** Party size when changing bucket / resizing mid-wait. */
    paxCount: z.number().int().positive().optional(),
    /** Explicit target bucket (SERVICE_TYPE or override). */
    bucketId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action !== 'CHANGE_BUCKET') return;
    if (data.paxCount === undefined && data.bucketId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'CHANGE_BUCKET requires paxCount and/or bucketId',
        path: ['paxCount'],
      });
    }
  });
export type HostTicketActionRequest = z.infer<
  typeof HostTicketActionRequestSchema
>;

/** PATCH /api/host/tickets/:id/action success body. */
export const HostTicketActionResponseSchema = z.object({
  id: z.string().min(1),
  displayNumber: z.string().min(1),
  status: TicketStatusSchema,
  bucketId: z.string().min(1),
  paxCount: z.number().int().positive(),
  priorityBoost: z.number().int().nonnegative(),
  createdAt: z.number().int().positive(),
  calledAt: z.number().int().positive().nullable().optional(),
  heldAt: z.number().int().positive().nullable().optional(),
  seatedAt: z.number().int().positive().nullable().optional(),
  cancelledAt: z.number().int().positive().nullable().optional(),
});
export type HostTicketActionResponse = z.infer<
  typeof HostTicketActionResponseSchema
>;

// --- BranchQueueRoom WebSocket contracts (Phase 2.1) ---

/** Client role on a branch live-queue socket. */
export const WsClientRoleSchema = z.enum(['HOST', 'TV', 'CUSTOMER']);
export type WsClientRole = z.infer<typeof WsClientRoleSchema>;

/**
 * First client → DO message after upgrade.
 * CUSTOMER must include `ticketId` so the room can target YOUR_TURN_CALLED.
 */
export const WsClientHelloSchema = z
  .object({
    type: z.literal('HELLO'),
    role: WsClientRoleSchema,
    branchId: z.string().min(1),
    ticketId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'CUSTOMER' && data.ticketId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'CUSTOMER hello requires ticketId',
        path: ['ticketId'],
      });
    }
  });
export type WsClientHello = z.infer<typeof WsClientHelloSchema>;

/** Fan-out to Host / TV / Customer after any queue mutation (e.g. SUMMON). */
export const QueueUpdatedEventSchema = z.object({
  type: z.literal('QUEUE_UPDATED'),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  displayNumber: z.string().min(1),
  status: TicketStatusSchema,
  at: z.number().int().positive(),
});
export type QueueUpdatedEvent = z.infer<typeof QueueUpdatedEventSchema>;

/** Targeted to the CUSTOMER socket whose HELLO.ticketId matches. */
export const YourTurnCalledEventSchema = z.object({
  type: z.literal('YOUR_TURN_CALLED'),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  displayNumber: z.string().min(1),
  at: z.number().int().positive(),
});
export type YourTurnCalledEvent = z.infer<typeof YourTurnCalledEventSchema>;

export const WsServerEventSchema = z.discriminatedUnion('type', [
  QueueUpdatedEventSchema,
  YourTurnCalledEventSchema,
]);
export type WsServerEvent = z.infer<typeof WsServerEventSchema>;

/**
 * Worker → DO internal broadcast body (POST …/broadcast).
 * GREEN: HostQueueService SUMMON (and later other actions) POSTs this to
 * `BRANCH_QUEUE_ROOM.idFromName(branchId)` so connected sockets fan out.
 */
export const BranchQueueBroadcastRequestSchema = z.object({
  type: z.literal('SUMMON'),
  branchId: z.string().min(1),
  ticketId: z.string().min(1),
  displayNumber: z.string().min(1),
  status: z.literal('CALLED'),
  at: z.number().int().positive().optional(),
});
export type BranchQueueBroadcastRequest = z.infer<
  typeof BranchQueueBroadcastRequestSchema
>;

// --- ZNS wallet ledger (Phase 2.2) ---

/** Matches `wallet_ledger.tx_type` in schema.sql. */
export const WalletLedgerTxTypeSchema = z.enum([
  'TOPUP_VIETQR',
  'ZNS_CALL_ALERT',
  'ADMIN_GRANT',
]);
export type WalletLedgerTxType = z.infer<typeof WalletLedgerTxTypeSchema>;

/** Prepaid ZNS "2 spots away" fee (VND). Deducted only when balance >= this. */
export const ZNS_APPROACHING_FEE_VND = 400 as const;

/**
 * Idempotency key for ApproachingTurn ZNS — stored in `wallet_ledger.reference_code`.
 * Never charge/send twice for the same ticket.
 */
export function znsApproachingIdempotencyKey(ticketId: string): string {
  return `zns_approaching_${ticketId}`;
}

/** Ledger row shape (camelCase contract; D1 columns are snake_case). */
export const WalletLedgerEntrySchema = z.object({
  id: z.string().min(1),
  merchantId: z.string().min(1),
  ticketId: z.string().min(1).nullable().optional(),
  amountVnd: z.number().int(),
  txType: WalletLedgerTxTypeSchema,
  referenceCode: z.string().min(1).nullable().optional(),
  createdAt: z.number().int().positive(),
});
export type WalletLedgerEntry = z.infer<typeof WalletLedgerEntrySchema>;

/** Outbound ZNS payload for ApproachingTurn (stub recorder in tests). */
export const ZnsApproachingDispatchSchema = z.object({
  template: z.literal('APPROACHING_TURN'),
  merchantId: z.string().min(1),
  ticketId: z.string().min(1),
  displayNumber: z.string().min(1),
  partiesAhead: z.literal(2),
  at: z.number().int().positive(),
});
export type ZnsApproachingDispatch = z.infer<typeof ZnsApproachingDispatchSchema>;

export const ApproachingTurnSkipReasonSchema = z.enum([
  'INSUFFICIENT_WALLET',
  'NO_CANDIDATE',
  'ALREADY_SENT',
]);
export type ApproachingTurnSkipReason = z.infer<
  typeof ApproachingTurnSkipReasonSchema
>;

/** Result of `ZnsDispatcherService.onTicketSeated` / `notifyApproachingTurn`. */
export const ApproachingTurnResultSchema = z.object({
  notifiedTicketId: z.string().min(1).nullable(),
  charged: z.boolean(),
  skippedReason: ApproachingTurnSkipReasonSchema.optional(),
});
export type ApproachingTurnResult = z.infer<typeof ApproachingTurnResultSchema>;

// --- Sepay VietQR top-up webhook (Phase 4.3) ---

/**
 * Transfer memo format: `LUOTDI <MERCHANT_SLUG>`.
 * Parsed from Sepay `content` (original bank memo).
 */
export const VIETQR_MEMO_PREFIX = 'LUOTDI' as const;

export function buildVietQrMemo(merchantSlug: string): string {
  return `${VIETQR_MEMO_PREFIX} ${merchantSlug}`;
}

/** Extract merchant slug from transfer content containing `LUOTDI <slug>`. */
export function parseVietQrMemoSlug(content: string): string | null {
  const match = content.match(/\bLUOTDI\s+([A-Za-z0-9][A-Za-z0-9_-]*)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Idempotency key for Sepay top-up — stored in `wallet_ledger.reference_code`. */
export function sepayTopupIdempotencyKey(sepayTxnId: number | string): string {
  return `sepay_topup_${sepayTxnId}`;
}

/** Incoming Sepay money-in webhook body (subset used by LượtĐi). */
export const SepayWebhookPayloadSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  gateway: z.string().optional(),
  transactionDate: z.string().optional(),
  accountNumber: z.string().optional(),
  subAccount: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  content: z.string().min(1),
  transferType: z.enum(['in', 'out']),
  description: z.string().optional(),
  transferAmount: z.number().int().positive(),
  referenceCode: z.string().nullable().optional(),
});
export type SepayWebhookPayload = z.infer<typeof SepayWebhookPayloadSchema>;

export const SepayWebhookResultSchema = z.object({
  success: z.boolean(),
  credited: z.boolean().optional(),
  merchantId: z.string().min(1).optional(),
  amountVnd: z.number().int().optional(),
  skippedReason: z
    .enum([
      'NOT_INCOMING',
      'MERCHANT_NOT_FOUND',
      'ALREADY_PROCESSED',
      'INVALID_MEMO',
    ])
    .optional(),
});
export type SepayWebhookResult = z.infer<typeof SepayWebhookResultSchema>;
