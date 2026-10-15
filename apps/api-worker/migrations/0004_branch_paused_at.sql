-- Round 4 · Admin "Cần chú ý": know how long a branch has been paused.
ALTER TABLE branches ADD COLUMN paused_at INTEGER;
UPDATE branches SET paused_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE is_paused = 1;
