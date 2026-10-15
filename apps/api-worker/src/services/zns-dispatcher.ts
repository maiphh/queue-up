/**
 * Prepaid ZNS "approaching turn" dispatcher (Phase 2.2).
 *
 * Contract for `onTicketSeated(seatedTicketId)`:
 * 1. Load the seated ticket's branch/bucket; list WAITING tickets in that
 *    bucket ordered by `(priority_boost DESC, created_at ASC)`.
 * 2. The ticket at index N (`partiesAhead === N`, N = branch `zns_almost_threshold`,
 *    default 2, set by the Manager in Cài đặt quầy) is the ApproachingTurn candidate
 *    (e.g. N=2: seat A·012 → notify A·014 when two parties remain ahead).
 * 3. If `merchant.wallet_balance_vnd >= ZNS_APPROACHING_FEE_VND` (400):
 *    - decrement wallet by 400
 *    - insert `wallet_ledger` (`tx_type: ZNS_CALL_ALERT`, `amount_vnd: -400`,
 *      `reference_code: zns_approaching_${ticket.id}`) in the same `db.batch()`
 *    - dispatch ZNS via optional `ZnsSender` (tests use a recorder)
 * 4. Idempotent: if a ledger row with that `reference_code` already exists,
 *    skip deduct/send (`skippedReason: ALREADY_SENT`).
 * 5. If wallet < 400: skip ZNS and ledger debit (`INSUFFICIENT_WALLET`);
 *    WebSocket-only fallback is out of scope for this service.
 * 6. With a real sender: no phone on file for the guest → `NO_RECIPIENT`
 *    (no charge). If the ZNS call fails, the debit + ledger row are rolled
 *    back (`SEND_FAILED`) so a later retry can use the same dedupe key.
 */

import {
  ZNS_APPROACHING_FEE_VND,
  znsApproachingIdempotencyKey,
  type ApproachingTurnResult,
  type ZnsApproachingDispatch,
} from '@luotdi/shared';

export type ZnsSender = {
  /** When true, tickets without a guest phone are skipped before charging. */
  readonly requiresRecipient?: boolean;
  sendApproachingTurn(payload: ZnsApproachingDispatch): Promise<void>;
};

type TicketContext = {
  id: string;
  branch_id: string;
  bucket_id: string;
  display_number: string;
  merchant_id: string;
  branch_name: string | null;
  phone: string | null;
};

export class ZnsDispatcherService {
  constructor(
    private readonly db: D1Database,
    private readonly sender?: ZnsSender,
  ) {}

  /**
   * After a ticket is SEATED, notify the WAITING ticket now 2 spots away
   * (same bucket), with prepaid wallet debit + idempotent ledger.
   */
  async onTicketSeated(seatedTicketId: string): Promise<ApproachingTurnResult> {
    const seated = await this.db
      .prepare(
        `SELECT id, branch_id, bucket_id FROM tickets WHERE id = ?`,
      )
      .bind(seatedTicketId)
      .first<{ id: string; branch_id: string; bucket_id: string }>();

    if (!seated) {
      return {
        notifiedTicketId: null,
        charged: false,
        skippedReason: 'NO_CANDIDATE',
      };
    }

    const waiting = await this.db
      .prepare(
        `SELECT id FROM tickets
         WHERE branch_id = ? AND bucket_id = ? AND status = 'WAITING'
         ORDER BY priority_boost DESC, created_at ASC`,
      )
      .bind(seated.branch_id, seated.bucket_id)
      .all<{ id: string }>();

    const threshold = await this.almostThreshold(seated.branch_id);
    const candidate = waiting.results?.[threshold];
    if (!candidate) {
      return {
        notifiedTicketId: null,
        charged: false,
        skippedReason: 'NO_CANDIDATE',
      };
    }

    return this.notifyApproachingTurn(candidate.id);
  }

  /**
   * Direct ApproachingTurn for a known ticket (idempotent charge + ZNS).
   * Used by tests / re-evaluation paths (e.g. after BUMP_PRIORITY).
   */
  /** Branch "almost your turn" threshold (1–5), default 2. */
  async almostThreshold(branchId: string): Promise<number> {
    try {
      const row = await this.db
        .prepare(`SELECT zns_almost_threshold AS n FROM branches WHERE id = ?`)
        .bind(branchId)
        .first<{ n: number | null }>();
      const n = Number(row?.n ?? 2);
      return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2;
    } catch {
      return 2;
    }
  }

  async notifyApproachingTurn(ticketId: string): Promise<ApproachingTurnResult> {
    const ticket = await this.loadTicketContext(ticketId);
    if (!ticket) {
      return {
        notifiedTicketId: null,
        charged: false,
        skippedReason: 'NO_CANDIDATE',
      };
    }

    const referenceCode = znsApproachingIdempotencyKey(ticket.id);

    const existing = await this.db
      .prepare(
        `SELECT id FROM wallet_ledger WHERE reference_code = ? LIMIT 1`,
      )
      .bind(referenceCode)
      .first<{ id: string }>();

    if (existing) {
      return {
        notifiedTicketId: ticket.id,
        charged: false,
        skippedReason: 'ALREADY_SENT',
      };
    }

    if (this.sender?.requiresRecipient && !ticket.phone) {
      return {
        notifiedTicketId: ticket.id,
        charged: false,
        skippedReason: 'NO_RECIPIENT',
      };
    }

    const merchant = await this.db
      .prepare(
        `SELECT wallet_balance_vnd AS balance FROM merchants WHERE id = ?`,
      )
      .bind(ticket.merchant_id)
      .first<{ balance: number }>();

    if (!merchant || merchant.balance < ZNS_APPROACHING_FEE_VND) {
      return {
        notifiedTicketId: ticket.id,
        charged: false,
        skippedReason: 'INSUFFICIENT_WALLET',
      };
    }

    const ledgerId = crypto.randomUUID();
    const createdAt = Date.now();

    // Atomic wallet decrement + ledger insert. Conditional UPDATE prevents
    // debit below fee; if changes=0 we remove any orphan ledger row.
    const batchResults = await this.db.batch([
      this.db
        .prepare(
          `UPDATE merchants
           SET wallet_balance_vnd = wallet_balance_vnd - ?
           WHERE id = ? AND wallet_balance_vnd >= ?`,
        )
        .bind(
          ZNS_APPROACHING_FEE_VND,
          ticket.merchant_id,
          ZNS_APPROACHING_FEE_VND,
        ),
      this.db
        .prepare(
          `INSERT INTO wallet_ledger (
             id, merchant_id, ticket_id, amount_vnd, tx_type, reference_code, created_at
           ) VALUES (?, ?, ?, ?, 'ZNS_CALL_ALERT', ?, ?)`,
        )
        .bind(
          ledgerId,
          ticket.merchant_id,
          ticket.id,
          -ZNS_APPROACHING_FEE_VND,
          referenceCode,
          createdAt,
        ),
    ]);

    const walletUpdated = (batchResults[0]?.meta?.changes ?? 0) > 0;

    if (!walletUpdated) {
      await this.db
        .prepare(`DELETE FROM wallet_ledger WHERE id = ?`)
        .bind(ledgerId)
        .run();

      const raced = await this.db
        .prepare(
          `SELECT id FROM wallet_ledger WHERE reference_code = ? LIMIT 1`,
        )
        .bind(referenceCode)
        .first<{ id: string }>();

      if (raced) {
        return {
          notifiedTicketId: ticket.id,
          charged: false,
          skippedReason: 'ALREADY_SENT',
        };
      }

      return {
        notifiedTicketId: ticket.id,
        charged: false,
        skippedReason: 'INSUFFICIENT_WALLET',
      };
    }

    if (this.sender) {
      const payload: ZnsApproachingDispatch = {
        template: 'APPROACHING_TURN',
        merchantId: ticket.merchant_id,
        ticketId: ticket.id,
        displayNumber: ticket.display_number,
        partiesAhead: await this.almostThreshold(ticket.branch_id),
        at: createdAt,
        ...(ticket.phone ? { phone: ticket.phone } : {}),
        ...(ticket.branch_name ? { branchName: ticket.branch_name } : {}),
      };
      try {
        await this.sender.sendApproachingTurn(payload);
      } catch {
        // Refund: undo debit + ledger so the dedupe key is free for a retry.
        await this.db.batch([
          this.db
            .prepare(
              `UPDATE merchants SET wallet_balance_vnd = wallet_balance_vnd + ? WHERE id = ?`,
            )
            .bind(ZNS_APPROACHING_FEE_VND, ticket.merchant_id),
          this.db.prepare(`DELETE FROM wallet_ledger WHERE id = ?`).bind(ledgerId),
        ]);
        return {
          notifiedTicketId: ticket.id,
          charged: false,
          skippedReason: 'SEND_FAILED',
        };
      }
    }

    return {
      notifiedTicketId: ticket.id,
      charged: true,
    };
  }

  private async loadTicketContext(
    ticketId: string,
  ): Promise<TicketContext | null> {
    return this.db
      .prepare(
        `SELECT t.id, t.branch_id, t.bucket_id, t.display_number, b.merchant_id,
                b.name AS branch_name,
                g.phone_e164 AS phone
         FROM tickets t
         JOIN branches b ON b.id = t.branch_id
         LEFT JOIN guest_users g
           ON g.zalo_user_id = t.zalo_user_id AND g.deleted_at IS NULL
         WHERE t.id = ?`,
      )
      .bind(ticketId)
      .first<TicketContext>();
  }
}
