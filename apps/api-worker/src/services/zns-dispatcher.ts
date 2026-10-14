/**
 * Prepaid ZNS "approaching turn" dispatcher (Phase 2.2).
 *
 * RED stub — GREEN implements atomic wallet check-and-deduct + ZNS send.
 *
 * Contract for `onTicketSeated(seatedTicketId)`:
 * 1. Load the seated ticket's branch/bucket; list WAITING tickets in that
 *    bucket ordered by `(priority_boost DESC, created_at ASC)`.
 * 2. The ticket at index 2 (`partiesAhead === 2`) is the ApproachingTurn
 *    candidate (e.g. seat A·012 → notify A·014 when two parties remain ahead).
 * 3. If `merchant.wallet_balance_vnd >= ZNS_APPROACHING_FEE_VND` (400):
 *    - decrement wallet by 400
 *    - insert `wallet_ledger` (`tx_type: ZNS_CALL_ALERT`, `amount_vnd: -400`,
 *      `reference_code: zns_approaching_${ticket.id}`) in the same `db.batch()`
 *    - dispatch ZNS via optional `ZnsSender` (tests use a recorder)
 * 4. Idempotent: if a ledger row with that `reference_code` already exists,
 *    skip deduct/send (`skippedReason: ALREADY_SENT`).
 * 5. If wallet < 400: skip ZNS and ledger debit (`INSUFFICIENT_WALLET`);
 *    WebSocket-only fallback is out of scope for this service.
 */

import type { ApproachingTurnResult, ZnsApproachingDispatch } from '@luotdi/shared';

export type ZnsSender = {
  sendApproachingTurn(payload: ZnsApproachingDispatch): Promise<void>;
};

export class ZnsDispatcherService {
  constructor(
    private readonly db: D1Database,
    private readonly sender?: ZnsSender,
  ) {
    void this.db;
    void this.sender;
  }

  /**
   * After a ticket is SEATED, notify the WAITING ticket now 2 spots away
   * (same bucket), with prepaid wallet debit + idempotent ledger.
   */
  async onTicketSeated(_seatedTicketId: string): Promise<ApproachingTurnResult> {
    throw new Error('Not implemented');
  }

  /**
   * Direct ApproachingTurn for a known ticket (idempotent charge + ZNS).
   * Used by tests / re-evaluation paths (e.g. after BUMP_PRIORITY).
   */
  async notifyApproachingTurn(_ticketId: string): Promise<ApproachingTurnResult> {
    throw new Error('Not implemented');
  }
}
