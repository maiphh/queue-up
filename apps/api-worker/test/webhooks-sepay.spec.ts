/**
 * Sepay VietQR top-up webhook — Phase 4.3 RED specs.
 * GREEN: POST /api/webhooks/sepay credits wallet from memo LUOTDI <slug>.
 */

import { env, SELF } from 'cloudflare:test';
import {
  SepayWebhookPayloadSchema,
  SepayWebhookResultSchema,
  buildVietQrMemo,
  parseVietQrMemoSlug,
  sepayTopupIdempotencyKey,
  type SepayWebhookPayload,
} from '@luotdi/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Ensure worker main is loaded for SELF / watch re-runs. */
import '../src/index';

const MERCHANT_ID = 'merchant-sepay-1';
const MERCHANT_SLUG = 'pho-24';
const BRANCH_ID = 'branch-sepay-1';
const BUCKET_A = 'bucket-sepay-a';

type LedgerRow = {
  id: string;
  merchant_id: string;
  ticket_id: string | null;
  amount_vnd: number;
  tx_type: string;
  reference_code: string | null;
  created_at: number;
};

async function applySchema(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

async function clearTables(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM tickets').run();
  await db.prepare('DELETE FROM wallet_ledger').run();
  await db.prepare('DELETE FROM queue_buckets').run();
  await db.prepare('DELETE FROM branches').run();
  await db.prepare('DELETE FROM merchants').run();
  await db.prepare('DELETE FROM staff_users').run();
}

async function seedMerchant(
  db: D1Database,
  opts: { walletBalanceVnd?: number; slug?: string } = {},
): Promise<void> {
  const now = Date.now();
  const wallet = opts.walletBalanceVnd ?? 1000;
  const slug = opts.slug ?? MERCHANT_SLUG;

  await db
    .prepare(
      `INSERT INTO merchants (
        id, name, slug, industry_type, plan_tier,
        monthly_ticket_count, wallet_balance_vnd, status, created_at
      ) VALUES (?, ?, ?, 'RESTAURANT', 'FREE', 0, ?, 'ACTIVE', ?)`,
    )
    .bind(MERCHANT_ID, 'Pho 24', slug, wallet, now)
    .run();

  await db
    .prepare(
      `INSERT INTO branches (
        id, merchant_id, name, address, district, city,
        qr_code_token, routing_mode, allow_remote_queue, is_paused,
        grace_period_mins, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, 10, ?)`,
    )
    .bind(
      BRANCH_ID,
      MERCHANT_ID,
      'Nguyen Hue',
      '1 Nguyen Hue',
      'Quan 1',
      'qr-sepay-1',
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO queue_buckets (
        id, branch_id, prefix, label_vi, label_en,
        min_pax, max_pax, active_counters, rolling_turnover_mins,
        current_seq, is_active
      ) VALUES (?, ?, 'A', '01-02 KHACH', '01-02 GUESTS', 1, 2, 4, 20, 0, 1)`,
    )
    .bind(BUCKET_A, BRANCH_ID)
    .run();
}

async function getWalletBalance(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT wallet_balance_vnd AS b FROM merchants WHERE id = ?')
    .bind(MERCHANT_ID)
    .first<{ b: number }>();
  if (!row) throw new Error('merchant not found');
  return row.b;
}

async function getLedgerByReference(
  db: D1Database,
  referenceCode: string,
): Promise<LedgerRow[]> {
  const result = await db
    .prepare('SELECT * FROM wallet_ledger WHERE reference_code = ?')
    .bind(referenceCode)
    .all<LedgerRow>();
  return result.results ?? [];
}

function sepayPayload(
  overrides: Partial<SepayWebhookPayload> = {},
): SepayWebhookPayload {
  return SepayWebhookPayloadSchema.parse({
    id: 92704,
    gateway: 'Vietcombank',
    transactionDate: '2024-07-02 11:08:33',
    accountNumber: '0123456789',
    content: `${buildVietQrMemo(MERCHANT_SLUG)} nap vi`,
    transferType: 'in',
    transferAmount: 50_000,
    referenceCode: 'FT24012345678',
    ...overrides,
  });
}

async function postSepay(
  body: SepayWebhookPayload,
): Promise<Response> {
  return SELF.fetch('http://localhost/api/webhooks/sepay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('VietQR memo helpers', () => {
  it('buildVietQrMemo formats LUOTDI <MERCHANT_SLUG>', () => {
    expect(buildVietQrMemo('pho-24')).toBe('LUOTDI pho-24');
  });

  it('parseVietQrMemoSlug extracts slug from bank content', () => {
    expect(parseVietQrMemoSlug('LUOTDI pho-24 nap vi')).toBe('pho-24');
    expect(parseVietQrMemoSlug('chuyen LUOTDI cafe-test')).toBe('cafe-test');
    expect(parseVietQrMemoSlug('no memo here')).toBeNull();
  });

  it('sepayTopupIdempotencyKey is sepay_topup_${id}', () => {
    expect(sepayTopupIdempotencyKey(92704)).toBe('sepay_topup_92704');
  });
});

describe('POST /api/webhooks/sepay — wallet top-up', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
  });

  it('credits merchant wallet when content has LUOTDI <slug> and transferType=in', async () => {
    await seedMerchant(env.DB, { walletBalanceVnd: 1000 });
    const payload = sepayPayload({ transferAmount: 50_000 });

    const res = await postSepay(payload);
    expect(res.status).toBe(200);

    const raw = await res.json();
    const result = SepayWebhookResultSchema.parse(raw);
    expect(result.success).toBe(true);
    expect(result.credited).toBe(true);
    expect(result.merchantId).toBe(MERCHANT_ID);
    expect(result.amountVnd).toBe(50_000);

    expect(await getWalletBalance(env.DB)).toBe(1000 + 50_000);

    const ref = sepayTopupIdempotencyKey(payload.id);
    const ledger = await getLedgerByReference(env.DB, ref);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.merchant_id).toBe(MERCHANT_ID);
    expect(ledger[0]!.ticket_id).toBeNull();
    expect(ledger[0]!.amount_vnd).toBe(50_000);
    expect(ledger[0]!.tx_type).toBe('TOPUP_VIETQR');
    expect(ledger[0]!.reference_code).toBe(ref);
  });

  it('is idempotent: replay of same Sepay id does not double-credit', async () => {
    await seedMerchant(env.DB, { walletBalanceVnd: 1000 });
    const payload = sepayPayload({ id: 1001, transferAmount: 25_000 });

    const first = SepayWebhookResultSchema.parse(await (await postSepay(payload)).json());
    expect(first.credited).toBe(true);

    const secondRes = await postSepay(payload);
    expect(secondRes.status).toBe(200);
    const second = SepayWebhookResultSchema.parse(await secondRes.json());
    expect(second.success).toBe(true);
    expect(second.credited).toBe(false);
    expect(second.skippedReason).toBe('ALREADY_PROCESSED');

    expect(await getWalletBalance(env.DB)).toBe(1000 + 25_000);
    expect(
      await getLedgerByReference(env.DB, sepayTopupIdempotencyKey(1001)),
    ).toHaveLength(1);
  });

  it('ignores outgoing transfers without mutating wallet', async () => {
    await seedMerchant(env.DB, { walletBalanceVnd: 1000 });
    const payload = sepayPayload({ transferType: 'out', transferAmount: 10_000 });

    const res = await postSepay(payload);
    expect(res.status).toBe(200);
    const result = SepayWebhookResultSchema.parse(await res.json());
    expect(result.success).toBe(true);
    expect(result.credited).toBe(false);
    expect(result.skippedReason).toBe('NOT_INCOMING');
    expect(await getWalletBalance(env.DB)).toBe(1000);
  });

  it('returns MERCHANT_NOT_FOUND when memo slug is unknown', async () => {
    await seedMerchant(env.DB, { walletBalanceVnd: 1000 });
    const payload = sepayPayload({
      content: 'LUOTDI unknown-slug nap',
      transferAmount: 10_000,
    });

    const res = await postSepay(payload);
    expect(res.status).toBe(200);
    const result = SepayWebhookResultSchema.parse(await res.json());
    expect(result.success).toBe(true);
    expect(result.credited).toBe(false);
    expect(result.skippedReason).toBe('MERCHANT_NOT_FOUND');
    expect(await getWalletBalance(env.DB)).toBe(1000);
  });

  it('returns INVALID_MEMO when content lacks LUOTDI slug', async () => {
    await seedMerchant(env.DB, { walletBalanceVnd: 1000 });
    const payload = sepayPayload({
      content: 'chuyen tien khong ma',
      transferAmount: 10_000,
    });

    const res = await postSepay(payload);
    expect(res.status).toBe(200);
    const result = SepayWebhookResultSchema.parse(await res.json());
    expect(result.success).toBe(true);
    expect(result.credited).toBe(false);
    expect(result.skippedReason).toBe('INVALID_MEMO');
    expect(await getWalletBalance(env.DB)).toBe(1000);
  });
});
