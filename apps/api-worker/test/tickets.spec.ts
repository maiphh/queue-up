import { env, SELF } from 'cloudflare:test';
import {
  ApiErrorSchema,
  CreateTicketRequestSchema,
  CreateTicketResponseSchema,
  type CreateTicketRequest,
} from '@luotdi/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Ensure worker main is loaded for SELF / watch re-runs. */
import '../src/index';
import { signGuestJwt } from '../src/services/jwt';

const MERCHANT_ID = 'merchant-1';
const BRANCH_ID = 'branch-1';
const BUCKET_A = 'bucket-a';
const BUCKET_B = 'bucket-b';
const BUCKET_C = 'bucket-c';
/** Middle dot U+00B7 — display format prefix·NNN */
const MIDDLE_DOT = '\u00B7';

async function applySchema(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

const CLIENT_ID = 'client-test';

async function clearTables(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM tickets').run();
  await db.prepare('DELETE FROM wallet_ledger').run();
  await db.prepare('DELETE FROM staff_branch_assignments').run();
  await db.prepare('DELETE FROM queue_buckets').run();
  await db.prepare('DELETE FROM branches').run();
  await db.prepare('DELETE FROM staff_users').run();
  await db.prepare('DELETE FROM merchants').run();
  await db.prepare('DELETE FROM clients').run();
}

async function seedMerchantBranchBuckets(
  db: D1Database,
  opts: {
    planTier?: string;
    monthlyTicketCount?: number;
    isPaused?: number;
  } = {},
): Promise<void> {
  const now = Date.now();
  const planTier = opts.planTier ?? 'FREE';
  const monthlyTicketCount = opts.monthlyTicketCount ?? 0;
  const isPaused = opts.isPaused ?? 0;

  await db
    .prepare(`INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)`)
    .bind(CLIENT_ID, 'Test Client', now)
    .run();

  await db
    .prepare(
      `INSERT INTO merchants (
        id, client_id, name, slug, industry_type, plan_tier,
        monthly_ticket_count, wallet_balance_vnd, status, created_at
      ) VALUES (?, ?, ?, ?, 'RESTAURANT', ?, ?, 0, 'ACTIVE', ?)`,
    )
    .bind(
      MERCHANT_ID,
      CLIENT_ID,
      'Cafe Test',
      'cafe-test',
      planTier,
      monthlyTicketCount,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO branches (
        id, merchant_id, name, address, district, city,
        qr_code_token, routing_mode, allow_remote_queue, is_paused,
        grace_period_mins, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, ?, 10, ?)`,
    )
    .bind(
      BRANCH_ID,
      MERCHANT_ID,
      'District 1',
      '1 Nguyen Hue',
      'Quan 1',
      'qr-branch-1',
      isPaused,
      now,
    )
    .run();

  const buckets = [
    {
      id: BUCKET_A,
      prefix: 'A',
      labelVi: '01-02 KHACH',
      labelEn: '01-02 GUESTS',
      minPax: 1,
      maxPax: 2,
      counters: 4,
      turnover: 20,
    },
    {
      id: BUCKET_B,
      prefix: 'B',
      labelVi: '03-04 KHACH',
      labelEn: '03-04 GUESTS',
      minPax: 3,
      maxPax: 4,
      counters: 3,
      turnover: 25,
    },
    {
      id: BUCKET_C,
      prefix: 'C',
      labelVi: '05-12 KHACH',
      labelEn: '05-12 GUESTS',
      minPax: 5,
      maxPax: 12,
      counters: 2,
      turnover: 35,
    },
  ];

  for (const b of buckets) {
    await db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
      )
      .bind(
        b.id,
        BRANCH_ID,
        b.prefix,
        b.labelVi,
        b.labelEn,
        b.minPax,
        b.maxPax,
        b.counters,
        b.turnover,
      )
      .run();
  }
}

/** Issue a guest JWT the same way /api/auth/zalo does. */
async function guestToken(zaloUserId: string): Promise<string> {
  return signGuestJwt(env.JWT_SECRET!, { sub: `guest-${zaloUserId}`, zid: zaloUserId });
}

async function postTicket(
  body: CreateTicketRequest & { zaloUserId?: string },
  extraBody: Record<string, unknown> = {},
): Promise<Response> {
  const { zaloUserId, ...rest } = body;
  const parsed = CreateTicketRequestSchema.parse(rest);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (zaloUserId) headers.Authorization = `Bearer ${await guestToken(zaloUserId)}`;
  return SELF.fetch('http://localhost/api/tickets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...parsed, ...extraBody }),
  });
}

describe('POST /api/tickets — concurrency-safe issuance', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB);
  });

  it('issues 25 concurrent 2-pax tickets as unique A·001..A·025 with no lock errors', async () => {
    const requests = Array.from({ length: 25 }, (_, i) =>
      postTicket({
        branchId: BRANCH_ID,
        paxCount: 2,
        zaloUserId: `zalo-concurrent-${i + 1}`,
        customerName: `Guest ${i + 1}`,
        source: 'QR_ONSITE',
      }),
    );

    const responses = await Promise.all(requests);

    const bodies: unknown[] = [];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const json: unknown = await res.json();
      bodies.push(json);
      const ticket = CreateTicketResponseSchema.parse(json);
      expect(ticket.status).toBe('WAITING');
      expect(ticket.bucketId).toBe(BUCKET_A);
    }

    const displayNumbers = bodies.map((b) =>
      CreateTicketResponseSchema.parse(b).displayNumber,
    );
    const expected = Array.from(
      { length: 25 },
      (_, i) => `A${MIDDLE_DOT}${String(i + 1).padStart(3, '0')}`,
    );

    expect(displayNumbers.sort()).toEqual(expected);
    expect(new Set(displayNumbers).size).toBe(25);

    const seqNumbers = bodies
      .map((b) => CreateTicketResponseSchema.parse(b).seqNumber)
      .sort((a, b) => a - b);
    expect(seqNumbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('returns 409 ACTIVE_TICKET_EXISTS when zalo user already has WAITING ticket', async () => {
    const zaloUserId = 'zalo-active-user';

    const first = await postTicket({
      branchId: BRANCH_ID,
      paxCount: 2,
      zaloUserId,
      customerName: 'First Guest',
      source: 'QR_ONSITE',
    });
    expect(first.status).toBe(200);
    CreateTicketResponseSchema.parse(await first.json());

    const second = await postTicket({
      branchId: BRANCH_ID,
      paxCount: 2,
      zaloUserId,
      customerName: 'First Guest Again',
      source: 'QR_ONSITE',
    });

    expect(second.status).toBe(409);
    const err = ApiErrorSchema.parse(await second.json());
    expect(err.code).toBe('ACTIVE_TICKET_EXISTS');
  });

  it('returns 423 QUEUE_PAUSED when branch.is_paused === 1', async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB, { isPaused: 1 });

    const res = await postTicket({
      branchId: BRANCH_ID,
      paxCount: 2,
      zaloUserId: 'zalo-paused',
      customerName: 'Paused Guest',
      source: 'QR_ONSITE',
    });

    expect(res.status).toBe(423);
    const err = ApiErrorSchema.parse(await res.json());
    expect(err.code).toBe('QUEUE_PAUSED');
  });

  it('returns 402 FREE_QUOTA_EXCEEDED when FREE merchant hits monthly cap', async () => {
    await clearTables(env.DB);
    await seedMerchantBranchBuckets(env.DB, {
      planTier: 'FREE',
      monthlyTicketCount: 200,
    });

    const res = await postTicket({
      branchId: BRANCH_ID,
      paxCount: 2,
      zaloUserId: 'zalo-quota',
      customerName: 'Quota Guest',
      source: 'QR_ONSITE',
    });

    expect(res.status).toBe(402);
    const err = ApiErrorSchema.parse(await res.json());
    expect(err.code).toBe('FREE_QUOTA_EXCEEDED');
  });

  it('ignores a client-sent zaloUserId and stores the JWT identity', async () => {
    const res = await postTicket(
      {
        branchId: BRANCH_ID,
        paxCount: 2,
        zaloUserId: 'zalo-real-owner',
        customerName: 'Real Owner',
      },
      { zaloUserId: 'zalo-victim' },
    );
    expect(res.status).toBe(200);
    const { id } = CreateTicketResponseSchema.parse(await res.json());
    const row = await env.DB.prepare('SELECT zalo_user_id FROM tickets WHERE id = ?')
      .bind(id)
      .first<{ zalo_user_id: string | null }>();
    expect(row?.zalo_user_id).toBe('zalo-real-owner');
  });

  it('anonymous body zaloUserId cannot trigger or bypass per-user dedupe', async () => {
    const first = await postTicket(
      { branchId: BRANCH_ID, paxCount: 2, customerName: 'Anon' },
      { zaloUserId: 'zalo-spoof' },
    );
    expect(first.status).toBe(200);
    const { id } = CreateTicketResponseSchema.parse(await first.json());
    const row = await env.DB.prepare('SELECT zalo_user_id FROM tickets WHERE id = ?')
      .bind(id)
      .first<{ zalo_user_id: string | null }>();
    expect(row?.zalo_user_id).toBeNull();
  });

  it('returns 401 for an invalid or tampered Bearer token', async () => {
    const good = await guestToken('zalo-x');
    const tampered = good.slice(0, -2) + (good.endsWith('A') ? 'BB' : 'AA');
    for (const token of ['not-a-jwt', tampered]) {
      const res = await SELF.fetch('http://localhost/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId: BRANCH_ID, paxCount: 2, customerName: 'X' }),
      });
      expect(res.status).toBe(401);
    }
  });

  it('answers CORS preflight for https://h5.zdn.vn only', async () => {
    const ok = await SELF.fetch('http://localhost/api/tickets', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://h5.zdn.vn',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(ok.status).toBeLessThan(300);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://h5.zdn.vn');
    expect(ok.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    );

    const bad = await SELF.fetch('http://localhost/api/tickets', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
