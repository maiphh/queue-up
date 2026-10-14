PRAGMA foreign_keys = ON;

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry_type TEXT NOT NULL DEFAULT 'RESTAURANT',
  plan_tier TEXT NOT NULL DEFAULT 'FREE',
  monthly_ticket_count INTEGER NOT NULL DEFAULT 0,
  wallet_balance_vnd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  district TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Ho Chi Minh',
  qr_code_token TEXT UNIQUE NOT NULL,
  routing_mode TEXT NOT NULL DEFAULT 'PARTY_SIZE',
  allow_remote_queue INTEGER NOT NULL DEFAULT 1,
  is_paused INTEGER NOT NULL DEFAULT 0,
  grace_period_mins INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL
);

CREATE TABLE queue_buckets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  label_vi TEXT NOT NULL,
  label_en TEXT NOT NULL,
  min_pax INTEGER NOT NULL DEFAULT 1,
  max_pax INTEGER NOT NULL DEFAULT 2,
  active_counters INTEGER NOT NULL DEFAULT 4,
  rolling_turnover_mins INTEGER NOT NULL DEFAULT 20,
  current_seq INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(branch_id, prefix)
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  bucket_id TEXT NOT NULL REFERENCES queue_buckets(id) ON DELETE CASCADE,
  ticket_date TEXT NOT NULL,
  seq_number INTEGER NOT NULL,
  display_number TEXT NOT NULL,
  zalo_user_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone_masked TEXT,
  customer_phone_encrypted TEXT,
  pax_count INTEGER NOT NULL DEFAULT 2,
  source TEXT NOT NULL DEFAULT 'QR_ONSITE',
  status TEXT NOT NULL DEFAULT 'WAITING',
  priority_boost INTEGER NOT NULL DEFAULT 0,
  preferences_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  called_at INTEGER,
  held_at INTEGER,
  seated_at INTEGER,
  cancelled_at INTEGER
);

CREATE INDEX idx_tickets_queue_order
ON tickets(branch_id, bucket_id, status, priority_boost DESC, created_at ASC);

CREATE INDEX idx_tickets_active_zalo_user
ON tickets(branch_id, zalo_user_id, status);

CREATE TABLE wallet_ledger (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  ticket_id TEXT,
  amount_vnd INTEGER NOT NULL,
  tx_type TEXT NOT NULL,
  reference_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE staff_users (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  branch_id TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
