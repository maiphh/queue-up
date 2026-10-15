-- LượtĐi local mock data (idempotent: clears then inserts)
-- Apply after schema.sql:
--   pnpm --filter api-worker db:seed

PRAGMA foreign_keys = ON;

DELETE FROM wallet_ledger;
DELETE FROM tickets;
DELETE FROM staff_branch_assignments;
DELETE FROM queue_buckets;
DELETE FROM branches;
DELETE FROM staff_users;
DELETE FROM merchants;
DELETE FROM clients;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
INSERT INTO clients (id, name, created_at) VALUES
  (
    'client-an-tam',
    'Nhóm An Tâm',
    (unixepoch('now') - 86400 * 90) * 1000
  ),
  (
    'client-cafe',
    'Cafe Trung',
    (unixepoch('now') - 86400 * 30) * 1000
  );

-- ---------------------------------------------------------------------------
-- Merchants (brands)
-- ---------------------------------------------------------------------------
INSERT INTO merchants (
  id, client_id, name, slug, industry_type, plan_tier,
  monthly_ticket_count, wallet_balance_vnd, status, created_at
) VALUES
  (
    'merchant-pho24',
    'client-an-tam',
    'Phở 24',
    'pho-24',
    'RESTAURANT',
    'PRO',
    42,
    50000,
    'ACTIVE',
    (unixepoch('now') - 86400 * 90) * 1000
  ),
  (
    'merchant-cafe',
    'client-cafe',
    'Cafe Trung',
    'cafe-trung',
    'RESTAURANT',
    'FREE',
    18,
    800,
    'ACTIVE',
    (unixepoch('now') - 86400 * 30) * 1000
  ),
  (
    'merchant-clinic',
    'client-an-tam',
    'Phòng Khám An Tâm',
    'an-tam',
    'CLINIC',
    'PRO',
    65,
    120000,
    'ACTIVE',
    (unixepoch('now') - 86400 * 60) * 1000
  );

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
INSERT INTO branches (
  id, merchant_id, name, address, district, city,
  qr_code_token, routing_mode, allow_remote_queue, is_paused,
  grace_period_mins, created_at
) VALUES
  (
    'branch-pho-d1',
    'merchant-pho24',
    'Phở 24 Nguyễn Huệ',
    '56 Nguyễn Huệ',
    'Quận 1',
    'Ho Chi Minh',
    'qr-pho-nguyen-hue',
    'PARTY_SIZE',
    1,
    0,
    10,
    (unixepoch('now') - 86400 * 90) * 1000
  ),
  (
    'branch-pho-d3',
    'merchant-pho24',
    'Phở 24 Quận 3',
    '88 Võ Văn Tần',
    'Quận 3',
    'Ho Chi Minh',
    'qr-pho-q3',
    'PARTY_SIZE',
    1,
    0,
    10,
    (unixepoch('now') - 86400 * 14) * 1000
  ),
  (
    'branch-cafe-d3',
    'merchant-cafe',
    'Cafe Trung Điện Biên Phủ',
    '220 Điện Biên Phủ',
    'Quận 3',
    'Ho Chi Minh',
    'qr-cafe-d3',
    'PARTY_SIZE',
    1,
    0,
    10,
    (unixepoch('now') - 86400 * 30) * 1000
  ),
  (
    'branch-clinic-tb',
    'merchant-clinic',
    'An Tâm Tân Bình',
    '12 Cộng Hòa',
    'Tân Bình',
    'Ho Chi Minh',
    'qr-clinic-tb',
    'SERVICE_TYPE',
    1,
    0,
    15,
    (unixepoch('now') - 86400 * 60) * 1000
  );

-- ---------------------------------------------------------------------------
-- Queue buckets
-- ---------------------------------------------------------------------------
-- Phở 24 D1 — party-size A/B/C (seq already advanced for seeded tickets)
INSERT INTO queue_buckets (
  id, branch_id, prefix, label_vi, label_en,
  min_pax, max_pax, active_counters, rolling_turnover_mins,
  current_seq, is_active
) VALUES
  ('bucket-pho-a', 'branch-pho-d1', 'A', '01-02 KHÁCH', '01-02 GUESTS', 1, 2, 4, 18, 8, 1),
  ('bucket-pho-b', 'branch-pho-d1', 'B', '03-04 KHÁCH', '03-04 GUESTS', 3, 4, 3, 25, 3, 1),
  ('bucket-pho-c', 'branch-pho-d1', 'C', '05-12 KHÁCH', '05-12 GUESTS', 5, 12, 2, 35, 1, 1);

-- Phở 24 D3 — fresh A/B/C
INSERT INTO queue_buckets (
  id, branch_id, prefix, label_vi, label_en,
  min_pax, max_pax, active_counters, rolling_turnover_mins,
  current_seq, is_active
) VALUES
  ('bucket-pho-d3-a', 'branch-pho-d3', 'A', '01-02 KHÁCH', '01-02 GUESTS', 1, 2, 4, 18, 0, 1),
  ('bucket-pho-d3-b', 'branch-pho-d3', 'B', '03-04 KHÁCH', '03-04 GUESTS', 3, 4, 3, 25, 0, 1),
  ('bucket-pho-d3-c', 'branch-pho-d3', 'C', '05-12 KHÁCH', '05-12 GUESTS', 5, 12, 2, 35, 0, 1);

-- Cafe Trung — smaller floor
INSERT INTO queue_buckets (
  id, branch_id, prefix, label_vi, label_en,
  min_pax, max_pax, active_counters, rolling_turnover_mins,
  current_seq, is_active
) VALUES
  ('bucket-cafe-a', 'branch-cafe-d3', 'A', '01-02 KHÁCH', '01-02 GUESTS', 1, 2, 2, 15, 2, 1),
  ('bucket-cafe-b', 'branch-cafe-d3', 'B', '03-04 KHÁCH', '03-04 GUESTS', 3, 4, 1, 22, 0, 1);

-- Clinic — service-type buckets (pax range unused for routing)
INSERT INTO queue_buckets (
  id, branch_id, prefix, label_vi, label_en,
  min_pax, max_pax, active_counters, rolling_turnover_mins,
  current_seq, is_active
) VALUES
  ('bucket-clinic-gen', 'branch-clinic-tb', 'G', 'KHÁM TỔNG QUÁT', 'GENERAL', 1, 1, 3, 12, 4, 1),
  ('bucket-clinic-lab', 'branch-clinic-tb', 'L', 'XÉT NGHIỆM', 'LAB', 1, 1, 2, 8, 2, 1);

-- ---------------------------------------------------------------------------
-- Live tickets (today, Asia/Ho_Chi_Minh ≈ now+7h)
-- ---------------------------------------------------------------------------
INSERT INTO tickets (
  id, branch_id, bucket_id, ticket_date, seq_number, display_number,
  zalo_user_id, customer_name, customer_phone_masked, customer_phone_encrypted,
  pax_count, source, status, priority_boost, preferences_json,
  created_at, called_at, held_at, seated_at, cancelled_at
) VALUES
  -- Phở 24 — CALLED (pinned summoned strip)
  (
    'ticket-pho-a007',
    'branch-pho-d1',
    'bucket-pho-a',
    date('now', '+7 hours'),
    7,
    'A' || char(183) || '007',
    'zalo-lan',
    'Nguyễn Thị Lan',
    '090****321',
    NULL,
    2,
    'QR_ONSITE',
    'CALLED',
    0,
    '[]',
    (unixepoch('now') - 1200) * 1000,
    (unixepoch('now') - 60) * 1000,
    NULL,
    NULL,
    NULL
  ),
  -- Phở 24 — WAITING queue
  (
    'ticket-pho-a008',
    'branch-pho-d1',
    'bucket-pho-a',
    date('now', '+7 hours'),
    8,
    'A' || char(183) || '008',
    'zalo-minh',
    'Trần Văn Minh',
    '091****654',
    NULL,
    2,
    'QR_ONSITE',
    'WAITING',
    0,
    '["HIGH_CHAIR"]',
    (unixepoch('now') - 900) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-pho-b001',
    'branch-pho-d1',
    'bucket-pho-b',
    date('now', '+7 hours'),
    1,
    'B' || char(183) || '001',
    'zalo-huong',
    'Lê Thị Hương',
    NULL,
    NULL,
    4,
    'MARKETPLACE',
    'WAITING',
    1,
    '[]',
    (unixepoch('now') - 1500) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-pho-b002',
    'branch-pho-d1',
    'bucket-pho-b',
    date('now', '+7 hours'),
    2,
    'B' || char(183) || '002',
    NULL,
    'Walk-in Party',
    NULL,
    NULL,
    3,
    'HOST_MANUAL',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 600) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-pho-c001',
    'branch-pho-d1',
    'bucket-pho-c',
    date('now', '+7 hours'),
    1,
    'C' || char(183) || '001',
    'zalo-duc',
    'Phạm Đức',
    '093****888',
    NULL,
    8,
    'QR_ONSITE',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 400) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  -- Earlier seated (history)
  (
    'ticket-pho-a006',
    'branch-pho-d1',
    'bucket-pho-a',
    date('now', '+7 hours'),
    6,
    'A' || char(183) || '006',
    'zalo-hoa',
    'Võ Thị Hoa',
    NULL,
    NULL,
    2,
    'QR_ONSITE',
    'SEATED',
    0,
    '[]',
    (unixepoch('now') - 2400) * 1000,
    (unixepoch('now') - 1800) * 1000,
    NULL,
    (unixepoch('now') - 1500) * 1000,
    NULL
  ),
  -- Cafe — quiet night
  (
    'ticket-cafe-a001',
    'branch-cafe-d3',
    'bucket-cafe-a',
    date('now', '+7 hours'),
    1,
    'A' || char(183) || '001',
    'zalo-an',
    'Đỗ An',
    NULL,
    NULL,
    1,
    'QR_ONSITE',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 300) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-cafe-a002',
    'branch-cafe-d3',
    'bucket-cafe-a',
    date('now', '+7 hours'),
    2,
    'A' || char(183) || '002',
    'zalo-my',
    'Ngô Mỹ',
    NULL,
    NULL,
    2,
    'MARKETPLACE',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 120) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  -- Clinic
  (
    'ticket-clinic-g003',
    'branch-clinic-tb',
    'bucket-clinic-gen',
    date('now', '+7 hours'),
    3,
    'G' || char(183) || '003',
    'zalo-khoa',
    'Bùi Khoa',
    '098****111',
    NULL,
    1,
    'QR_ONSITE',
    'CALLED',
    0,
    '[]',
    (unixepoch('now') - 800) * 1000,
    (unixepoch('now') - 45) * 1000,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-clinic-g004',
    'branch-clinic-tb',
    'bucket-clinic-gen',
    date('now', '+7 hours'),
    4,
    'G' || char(183) || '004',
    'zalo-yen',
    'Mai Yến',
    NULL,
    NULL,
    1,
    'QR_ONSITE',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 500) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'ticket-clinic-l001',
    'branch-clinic-tb',
    'bucket-clinic-lab',
    date('now', '+7 hours'),
    1,
    'L' || char(183) || '001',
    'zalo-son',
    'Hà Sơn',
    NULL,
    NULL,
    1,
    'QR_ONSITE',
    'WAITING',
    0,
    '[]',
    (unixepoch('now') - 200) * 1000,
    NULL,
    NULL,
    NULL,
    NULL
  );

-- ---------------------------------------------------------------------------
-- Staff (password_hash is a placeholder — not for real auth)
-- ---------------------------------------------------------------------------
INSERT INTO staff_users (
  id, merchant_id, branch_id, client_id, email, password_hash, role, created_at
) VALUES
  (
    'staff-platform-admin',
    NULL,
    NULL,
    NULL,
    'admin@luotdi.vn',
    'dev-only-not-a-real-hash',
    'PLATFORM_ADMIN',
    (unixepoch('now') - 86400 * 120) * 1000
  ),
  (
    'staff-client-antam',
    NULL,
    NULL,
    'client-an-tam',
    'client@antam.vn',
    'dev-only-not-a-real-hash',
    'CLIENT_ADMIN',
    (unixepoch('now') - 86400 * 90) * 1000
  ),
  (
    'staff-client-cafe',
    NULL,
    NULL,
    'client-cafe',
    'client@cafetrung.vn',
    'dev-only-not-a-real-hash',
    'CLIENT_ADMIN',
    (unixepoch('now') - 86400 * 30) * 1000
  ),
  (
    'staff-manager-pho-nh',
    'merchant-pho24',
    'branch-pho-d1',
    NULL,
    'manager@pho-nh.vn',
    'dev-only-not-a-real-hash',
    'BRANCH_MANAGER',
    (unixepoch('now') - 86400 * 90) * 1000
  ),
  (
    'staff-manager-pho-q3',
    'merchant-pho24',
    'branch-pho-d3',
    NULL,
    'manager@pho-q3.vn',
    'dev-only-not-a-real-hash',
    'BRANCH_MANAGER',
    (unixepoch('now') - 86400 * 14) * 1000
  ),
  (
    'staff-manager-clinic',
    'merchant-clinic',
    'branch-clinic-tb',
    NULL,
    'manager@clinic.vn',
    'dev-only-not-a-real-hash',
    'BRANCH_MANAGER',
    (unixepoch('now') - 86400 * 60) * 1000
  ),
  (
    'staff-manager-cafe',
    'merchant-cafe',
    'branch-cafe-d3',
    NULL,
    'manager@cafe.vn',
    'dev-only-not-a-real-hash',
    'BRANCH_MANAGER',
    (unixepoch('now') - 86400 * 30) * 1000
  );

INSERT INTO staff_branch_assignments (staff_id, branch_id) VALUES
  ('staff-manager-pho-nh', 'branch-pho-d1'),
  ('staff-manager-pho-q3', 'branch-pho-d3'),
  ('staff-manager-clinic', 'branch-clinic-tb'),
  ('staff-manager-cafe', 'branch-cafe-d3');

-- ---------------------------------------------------------------------------
-- Wallet ledger sample (top-up history)
-- ---------------------------------------------------------------------------
INSERT INTO wallet_ledger (
  id, merchant_id, ticket_id, amount_vnd, tx_type, reference_code, created_at
) VALUES
  (
    'ledger-pho-topup-1',
    'merchant-pho24',
    NULL,
    100000,
    'TOPUP_VIETQR',
    'sepay_topup_demo_001',
    (unixepoch('now') - 86400 * 7) * 1000
  ),
  (
    'ledger-pho-zns-1',
    'merchant-pho24',
    'ticket-pho-a006',
    -400,
    'ZNS_CALL_ALERT',
    'zns_approaching_ticket-pho-a006',
    (unixepoch('now') - 1500) * 1000
  );

-- ---------------------------------------------------------------------------
-- Round 4: per-branch TV slugs (/tv/:branchSlug)
-- ---------------------------------------------------------------------------
UPDATE branches SET slug = 'pho-24-nh' WHERE id = 'branch-pho-d1';
UPDATE branches SET slug = 'pho-24-q3' WHERE id = 'branch-pho-d3';
UPDATE branches SET slug = 'cafe-trung-q3' WHERE id = 'branch-cafe-d3';
UPDATE branches SET slug = 'an-tam-tan-binh' WHERE id = 'branch-clinic-tb';

-- Demo coordinates for "Gần bạn" (mirrors migrations/0005_branch_location.sql).
UPDATE branches SET lat = 10.7743, lng = 106.7038 WHERE id = 'branch-pho-d1';
UPDATE branches SET lat = 10.7765, lng = 106.6880 WHERE id = 'branch-pho-d3';
UPDATE branches SET lat = 10.8016, lng = 106.6537 WHERE id = 'branch-clinic-tb';
UPDATE branches SET lat = 10.7837, lng = 106.6893 WHERE id = 'branch-cafe-d3';
