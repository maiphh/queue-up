-- Round 4 · M8 Cài đặt quầy: per-branch ops settings owned by the Manager.
-- grace_period_mins already exists (hold time). Everything here has a safe default.
ALTER TABLE branches ADD COLUMN zns_almost_threshold INTEGER NOT NULL DEFAULT 2; -- "Nhắn khi sắp đến lượt" (1–5 groups ahead)
ALTER TABLE branches ADD COLUMN zns_call_enabled INTEGER NOT NULL DEFAULT 1;     -- "Nhắn khi được gọi" (stored; template pending)
ALTER TABLE branches ADD COLUMN open_time TEXT;                                   -- "HH:MM" Asia/Ho_Chi_Minh, NULL = always open
ALTER TABLE branches ADD COLUMN close_time TEXT;
ALTER TABLE branches ADD COLUMN auto_pause_wait_mins INTEGER;                     -- NULL = off
ALTER TABLE branches ADD COLUMN shortcuts_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN tv_tts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN tv_voice TEXT NOT NULL DEFAULT 'female-south';
ALTER TABLE branches ADD COLUMN tv_chime INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN tv_mascot INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branches ADD COLUMN tv_static INTEGER NOT NULL DEFAULT 0;
