-- Drop all LượtĐi tables (local reset). Safe to re-run.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS wallet_ledger;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS staff_branch_assignments;
DROP TABLE IF EXISTS queue_buckets;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS staff_users;
DROP TABLE IF EXISTS merchants;
DROP TABLE IF EXISTS clients;

PRAGMA foreign_keys = ON;
