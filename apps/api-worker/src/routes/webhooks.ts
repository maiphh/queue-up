/**
 * External payment webhooks (Phase 4.3).
 * Sepay VietQR top-up: memo `LUOTDI <MERCHANT_SLUG>` credits wallet.
 */

import {
  SepayWebhookPayloadSchema,
  parseVietQrMemoSlug,
  sepayTopupIdempotencyKey,
  type SepayWebhookResult,
} from '@luotdi/shared';
import { Hono } from 'hono';
import type { Env } from '../index';

const webhooks = new Hono<{ Bindings: Env }>();

webhooks.post('/sepay', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { success: false, error: 'INVALID_BODY', code: 'INVALID_BODY' },
      400,
    );
  }

  const parsed = SepayWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'INVALID_BODY', code: 'INVALID_BODY' },
      400,
    );
  }

  const payload = parsed.data;
  const db = c.env.DB;

  if (payload.transferType !== 'in') {
    const result: SepayWebhookResult = {
      success: true,
      credited: false,
      skippedReason: 'NOT_INCOMING',
    };
    return c.json(result);
  }

  const slug = parseVietQrMemoSlug(payload.content);
  if (!slug) {
    const result: SepayWebhookResult = {
      success: true,
      credited: false,
      skippedReason: 'INVALID_MEMO',
    };
    return c.json(result);
  }

  const merchant = await db
    .prepare(
      `SELECT id, wallet_balance_vnd FROM merchants WHERE lower(slug) = ? LIMIT 1`,
    )
    .bind(slug.toLowerCase())
    .first<{ id: string; wallet_balance_vnd: number }>();

  if (!merchant) {
    const result: SepayWebhookResult = {
      success: true,
      credited: false,
      skippedReason: 'MERCHANT_NOT_FOUND',
    };
    return c.json(result);
  }

  const referenceCode = sepayTopupIdempotencyKey(payload.id);
  const existing = await db
    .prepare(
      `SELECT id FROM wallet_ledger WHERE reference_code = ? LIMIT 1`,
    )
    .bind(referenceCode)
    .first<{ id: string }>();

  if (existing) {
    const result: SepayWebhookResult = {
      success: true,
      credited: false,
      merchantId: merchant.id,
      amountVnd: payload.transferAmount,
      skippedReason: 'ALREADY_PROCESSED',
    };
    return c.json(result);
  }

  const ledgerId = `ledger_sepay_${payload.id}`;
  const now = Date.now();
  const amount = payload.transferAmount;

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE merchants
           SET wallet_balance_vnd = wallet_balance_vnd + ?
           WHERE id = ?`,
        )
        .bind(amount, merchant.id),
      db
        .prepare(
          `INSERT INTO wallet_ledger (
            id, merchant_id, ticket_id, amount_vnd, tx_type, reference_code, created_at
          ) VALUES (?, ?, NULL, ?, 'TOPUP_VIETQR', ?, ?)`,
        )
        .bind(ledgerId, merchant.id, amount, referenceCode, now),
    ]);
  } catch {
    // Race: another worker may have inserted the same reference_code.
    const raced = await db
      .prepare(
        `SELECT id FROM wallet_ledger WHERE reference_code = ? LIMIT 1`,
      )
      .bind(referenceCode)
      .first<{ id: string }>();
    if (raced) {
      const result: SepayWebhookResult = {
        success: true,
        credited: false,
        merchantId: merchant.id,
        amountVnd: amount,
        skippedReason: 'ALREADY_PROCESSED',
      };
      return c.json(result);
    }
    throw new Error('sepay top-up batch failed');
  }

  const result: SepayWebhookResult = {
    success: true,
    credited: true,
    merchantId: merchant.id,
    amountVnd: amount,
  };
  return c.json(result);
});

export { webhooks };
