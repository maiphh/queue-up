import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Ensure worker main is loaded for SELF / watch re-runs. */
import '../src/index';

const CLIENT_AN_TAM = 'client-an-tam';
const CLIENT_CAFE = 'client-cafe';
const MERCHANT_PHO = 'merchant-pho24';
const MERCHANT_CLINIC = 'merchant-clinic';
const MERCHANT_CAFE = 'merchant-cafe';
const BRANCH_PHO_D1 = 'branch-pho-d1';
const BRANCH_PHO_D3 = 'branch-pho-d3';
const BRANCH_CLINIC = 'branch-clinic-tb';
const BRANCH_CAFE = 'branch-cafe-d3';
const BUCKET_PHO_A = 'bucket-pho-a';
const BUCKET_CLINIC_GEN = 'bucket-clinic-gen';
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

async function seedActorScopeFixture(db: D1Database): Promise<void> {
  const now = Date.now();

  await db.batch([
    db
      .prepare(`INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)`)
      .bind(CLIENT_AN_TAM, 'Nhóm An Tâm', now),
    db
      .prepare(`INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)`)
      .bind(CLIENT_CAFE, 'Cafe Trung', now),
    db
      .prepare(
        `INSERT INTO merchants (
          id, client_id, name, slug, industry_type, plan_tier,
          monthly_ticket_count, wallet_balance_vnd, status, created_at
        ) VALUES (?, ?, ?, ?, 'RESTAURANT', 'PRO', 0, 0, 'ACTIVE', ?)`,
      )
      .bind(MERCHANT_PHO, CLIENT_AN_TAM, 'Phở 24', 'pho-24', now),
    db
      .prepare(
        `INSERT INTO merchants (
          id, client_id, name, slug, industry_type, plan_tier,
          monthly_ticket_count, wallet_balance_vnd, status, created_at
        ) VALUES (?, ?, ?, ?, 'CLINIC', 'PRO', 0, 0, 'ACTIVE', ?)`,
      )
      .bind(MERCHANT_CLINIC, CLIENT_AN_TAM, 'Phòng Khám An Tâm', 'an-tam', now),
    db
      .prepare(
        `INSERT INTO merchants (
          id, client_id, name, slug, industry_type, plan_tier,
          monthly_ticket_count, wallet_balance_vnd, status, created_at
        ) VALUES (?, ?, ?, ?, 'RESTAURANT', 'FREE', 0, 0, 'ACTIVE', ?)`,
      )
      .bind(MERCHANT_CAFE, CLIENT_CAFE, 'Cafe Trung', 'cafe-trung', now),
  ]);

  await db.batch([
    db
      .prepare(
        `INSERT INTO branches (
          id, merchant_id, name, address, district, city,
          qr_code_token, routing_mode, allow_remote_queue, is_paused,
          grace_period_mins, created_at
        ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, 10, ?)`,
      )
      .bind(
        BRANCH_PHO_D1,
        MERCHANT_PHO,
        'Phở 24 Nguyễn Huệ',
        '56 Nguyễn Huệ',
        'Quận 1',
        'qr-pho-nguyen-hue',
        now,
      ),
    db
      .prepare(
        `INSERT INTO branches (
          id, merchant_id, name, address, district, city,
          qr_code_token, routing_mode, allow_remote_queue, is_paused,
          grace_period_mins, created_at
        ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, 10, ?)`,
      )
      .bind(
        BRANCH_PHO_D3,
        MERCHANT_PHO,
        'Phở 24 Quận 3',
        '88 Võ Văn Tần',
        'Quận 3',
        'qr-pho-q3',
        now,
      ),
    db
      .prepare(
        `INSERT INTO branches (
          id, merchant_id, name, address, district, city,
          qr_code_token, routing_mode, allow_remote_queue, is_paused,
          grace_period_mins, created_at
        ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'SERVICE_TYPE', 1, 0, 15, ?)`,
      )
      .bind(
        BRANCH_CLINIC,
        MERCHANT_CLINIC,
        'An Tâm Tân Bình',
        '12 Cộng Hòa',
        'Tân Bình',
        'qr-clinic-tb',
        now,
      ),
    db
      .prepare(
        `INSERT INTO branches (
          id, merchant_id, name, address, district, city,
          qr_code_token, routing_mode, allow_remote_queue, is_paused,
          grace_period_mins, created_at
        ) VALUES (?, ?, ?, ?, ?, 'Ho Chi Minh', ?, 'PARTY_SIZE', 1, 0, 10, ?)`,
      )
      .bind(
        BRANCH_CAFE,
        MERCHANT_CAFE,
        'Cafe Trung Điện Biên Phủ',
        '220 Điện Biên Phủ',
        'Quận 3',
        'qr-cafe-d3',
        now,
      ),
  ]);

  await db.batch([
    db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, 'A', '01-02', '01-02', 1, 2, 4, 20, 0, 1)`,
      )
      .bind(BUCKET_PHO_A, BRANCH_PHO_D1),
    db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, 'G', 'GENERAL', 'GENERAL', 1, 1, 2, 12, 0, 1)`,
      )
      .bind(BUCKET_CLINIC_GEN, BRANCH_CLINIC),
    db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, 'A', '01-02', '01-02', 1, 2, 2, 15, 0, 1)`,
      )
      .bind('bucket-cafe-a', BRANCH_CAFE),
    db
      .prepare(
        `INSERT INTO queue_buckets (
          id, branch_id, prefix, label_vi, label_en,
          min_pax, max_pax, active_counters, rolling_turnover_mins,
          current_seq, is_active
        ) VALUES (?, ?, 'A', '01-02', '01-02', 1, 2, 4, 20, 0, 1)`,
      )
      .bind('bucket-pho-d3-a', BRANCH_PHO_D3),
  ]);
}

async function seedWaitingTicket(
  db: D1Database,
  opts: { id: string; branchId: string; bucketId: string; seq?: number },
): Promise<void> {
  const createdAt = Date.now();
  const seq = opts.seq ?? 1;
  const ticketDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(createdAt));

  await db
    .prepare(
      `INSERT INTO tickets (
        id, branch_id, bucket_id, ticket_date, seq_number, display_number,
        zalo_user_id, customer_name, pax_count, source, status,
        priority_boost, preferences_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'Guest', 2, 'QR_ONSITE', 'WAITING', 0, '[]', ?)`,
    )
    .bind(
      opts.id,
      opts.branchId,
      opts.bucketId,
      ticketDate,
      seq,
      `A${MIDDLE_DOT}${String(seq).padStart(3, '0')}`,
      createdAt,
    )
    .run();
}

describe('Actor scope — clients, managers, admin onboard', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await clearTables(env.DB);
    await seedActorScopeFixture(env.DB);
  });

  it('GET /api/client/portfolio for client-an-tam includes pho + clinic, not cafe', async () => {
    const res = await SELF.fetch('http://localhost/api/client/portfolio', {
      headers: {
        'X-Dev-Actor': 'CLIENT_ADMIN',
        'X-Dev-Client-Id': CLIENT_AN_TAM,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      clientId: string;
      brands: Array<{ id: string; branches: Array<{ id: string }> }>;
    };
    expect(body.clientId).toBe(CLIENT_AN_TAM);

    const branchIds = body.brands.flatMap((b) => b.branches.map((br) => br.id));
    expect(branchIds).toEqual(
      expect.arrayContaining([BRANCH_PHO_D1, BRANCH_PHO_D3, BRANCH_CLINIC]),
    );
    expect(branchIds).not.toContain(BRANCH_CAFE);
  });

  it('BRANCH_MANAGER with X-Dev-Branch-Id can summon on assigned branch only', async () => {
    await seedWaitingTicket(env.DB, {
      id: 'ticket-pho-scope',
      branchId: BRANCH_PHO_D1,
      bucketId: BUCKET_PHO_A,
    });
    await seedWaitingTicket(env.DB, {
      id: 'ticket-clinic-scope',
      branchId: BRANCH_CLINIC,
      bucketId: BUCKET_CLINIC_GEN,
      seq: 2,
    });

    const okRes = await SELF.fetch(
      'http://localhost/api/host/tickets/ticket-pho-scope/action',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Actor': 'BRANCH_MANAGER',
          'X-Dev-Branch-Id': BRANCH_PHO_D1,
        },
        body: JSON.stringify({ action: 'SUMMON' }),
      },
    );
    expect(okRes.status).not.toBe(403);
    expect(okRes.status).toBe(200);

    const forbidden = await SELF.fetch(
      'http://localhost/api/host/tickets/ticket-clinic-scope/action',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Actor': 'BRANCH_MANAGER',
          'X-Dev-Branch-Id': BRANCH_PHO_D1,
        },
        body: JSON.stringify({ action: 'SUMMON' }),
      },
    );
    expect(forbidden.status).toBe(403);
  });

  it('POST /api/admin/clients as PLATFORM_ADMIN returns 201; CLIENT_ADMIN gets 403', async () => {
    const onboardBody = {
      clientName: 'Nhóm Mới',
      brandName: 'Brand Mới',
      industryType: 'RESTAURANT',
      branchName: 'Chi nhánh 1',
      address: '1 Lê Lợi',
      district: 'Quận 1',
      routingMode: 'PARTY_SIZE',
      planTier: 'FREE',
    };

    const adminRes = await SELF.fetch('http://localhost/api/admin/clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Actor': 'PLATFORM_ADMIN',
      },
      body: JSON.stringify(onboardBody),
    });
    expect(adminRes.status).toBe(201);
    const created = (await adminRes.json()) as { clientId: string };
    expect(created.clientId).toEqual(expect.any(String));

    const row = await env.DB.prepare(`SELECT id, name FROM clients WHERE id = ?`)
      .bind(created.clientId)
      .first<{ id: string; name: string }>();
    expect(row?.name).toBe('Nhóm Mới');

    const clientRes = await SELF.fetch('http://localhost/api/admin/clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Actor': 'CLIENT_ADMIN',
        'X-Dev-Client-Id': CLIENT_AN_TAM,
      },
      body: JSON.stringify(onboardBody),
    });
    expect(clientRes.status).toBe(403);
  });

  it('GET /api/admin/overview with no actor header returns 401', async () => {
    const res = await SELF.fetch('http://localhost/api/admin/overview');
    expect(res.status).toBe(401);
  });

  it('POST /api/tickets with no actor still issues a number', async () => {
    const res = await SELF.fetch('http://localhost/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: BRANCH_PHO_D1,
        paxCount: 2,
        customerName: 'Guest Open',
        source: 'QR_ONSITE',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { displayNumber: string; status: string };
    expect(body.status).toBe('WAITING');
    expect(body.displayNumber).toMatch(/^A/);
  });
});
