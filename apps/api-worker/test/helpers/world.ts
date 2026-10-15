/** Compact test world shared by round-4 specs (TV, manager, client, admin, marketplace). */

export async function applySchema(db: D1Database, sql: string): Promise<void> {
  for (const st of sql.split(';').map((s) => s.trim())) {
    if (st.length > 0 && !st.startsWith('--')) await db.prepare(st).run();
  }
}

export const W = {
  client: 'client-w',
  merchant: 'merchant-w',
  branch: 'branch-w1',
  branch2: 'branch-w2',
  bucketA: 'bucket-w-a',
  bucketB: 'bucket-w-b',
  bucket2A: 'bucket-w2-a',
} as const;

export function vnToday(nowMs = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
}

export async function resetWorld(db: D1Database, opts: { paused?: boolean; wallet?: number } = {}) {
  for (const t of [
    'tickets', 'wallet_ledger', 'staff_branch_assignments', 'queue_buckets',
    'branches', 'staff_users', 'merchants', 'clients',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO clients (id, name, created_at) VALUES (?1, 'Nhóm W', ?2)`).bind(W.client, now),
    db.prepare(
      `INSERT INTO merchants (id, client_id, name, slug, industry_type, plan_tier, monthly_ticket_count, wallet_balance_vnd, status, created_at)
       VALUES (?1, ?2, 'Phở W', 'pho-w', 'RESTAURANT', 'PRO', 0, ?3, 'ACTIVE', ?4)`,
    ).bind(W.merchant, W.client, opts.wallet ?? 50_000, now),
    db.prepare(
      `INSERT INTO branches (id, merchant_id, name, address, district, city, qr_code_token, routing_mode, allow_remote_queue, is_paused, grace_period_mins, created_at, slug)
       VALUES (?1, ?2, 'Phở W Nguyễn Huệ', '56 Nguyễn Huệ', 'Quận 1', 'Ho Chi Minh', 'qr-w1', 'PARTY_SIZE', 1, ?3, 10, ?4, 'pho-w-nh')`,
    ).bind(W.branch, W.merchant, opts.paused ? 1 : 0, now),
    db.prepare(
      `INSERT INTO branches (id, merchant_id, name, address, district, city, qr_code_token, routing_mode, allow_remote_queue, is_paused, grace_period_mins, created_at, slug)
       VALUES (?1, ?2, 'Phở W Quận 3', '1 Võ Văn Tần', 'Quận 3', 'Ho Chi Minh', 'qr-w2', 'PARTY_SIZE', 1, 0, 10, ?3, 'pho-w-q3')`,
    ).bind(W.branch2, W.merchant, now + 1),
    db.prepare(
      `INSERT INTO queue_buckets (id, branch_id, prefix, label_vi, label_en, min_pax, max_pax, active_counters, rolling_turnover_mins, current_seq, is_active)
       VALUES (?1, ?2, 'A', 'Bàn A', 'Table A', 1, 2, 2, 10, 0, 1)`,
    ).bind(W.bucketA, W.branch),
    db.prepare(
      `INSERT INTO queue_buckets (id, branch_id, prefix, label_vi, label_en, min_pax, max_pax, active_counters, rolling_turnover_mins, current_seq, is_active)
       VALUES (?1, ?2, 'B', 'Bàn B', 'Table B', 3, 12, 1, 20, 0, 1)`,
    ).bind(W.bucketB, W.branch),
    db.prepare(
      `INSERT INTO queue_buckets (id, branch_id, prefix, label_vi, label_en, min_pax, max_pax, active_counters, rolling_turnover_mins, current_seq, is_active)
       VALUES (?1, ?2, 'A', 'Bàn A', 'Table A', 1, 12, 1, 10, 0, 1)`,
    ).bind(W.bucket2A, W.branch2),
  ]);
}

export type TicketSeed = {
  id: string;
  num: string;
  status?: 'WAITING' | 'CALLED' | 'HELD' | 'SEATED' | 'CANCELLED';
  bucket?: string;
  branch?: string;
  name?: string;
  pax?: number;
  source?: string;
  createdAt?: number;
  calledAt?: number | null;
  heldAt?: number | null;
  seatedAt?: number | null;
  cancelledAt?: number | null;
  zaloUserId?: string | null;
  phoneMasked?: string | null;
  date?: string;
  boost?: number;
};

export async function addTickets(db: D1Database, rows: TicketSeed[]): Promise<void> {
  const now = Date.now();
  await db.batch(
    rows.map((r, i) =>
      db
        .prepare(
          `INSERT INTO tickets (id, branch_id, bucket_id, ticket_date, seq_number, display_number, zalo_user_id,
             customer_name, customer_phone_masked, pax_count, source, status, priority_boost, created_at,
             called_at, held_at, seated_at, cancelled_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
        )
        .bind(
          r.id,
          r.branch ?? W.branch,
          r.bucket ?? W.bucketA,
          r.date ?? vnToday(now),
          i + 1,
          r.num,
          r.zaloUserId ?? null,
          r.name ?? `Khách ${r.num}`,
          r.phoneMasked ?? null,
          r.pax ?? 2,
          r.source ?? 'QR_ONSITE',
          r.status ?? 'WAITING',
          r.boost ?? 0,
          r.createdAt ?? now - (rows.length - i) * 60_000,
          r.calledAt ?? null,
          r.heldAt ?? null,
          r.seatedAt ?? null,
          r.cancelledAt ?? null,
        ),
    ),
  );
}
