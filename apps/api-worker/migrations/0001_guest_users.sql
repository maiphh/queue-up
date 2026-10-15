-- Guest identity derived from verified Zalo access tokens (see routes/auth.ts).
CREATE TABLE IF NOT EXISTS guest_users (
  id TEXT PRIMARY KEY,
  zalo_user_id TEXT UNIQUE NOT NULL,
  zalo_oa_uid TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone_e164 TEXT,
  notify_opt_in INTEGER NOT NULL DEFAULT 0,
  oa_followed_at INTEGER,
  last_interaction_at INTEGER,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
