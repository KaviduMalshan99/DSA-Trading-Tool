-- 001_users_google_sub.sql
--
-- Adds users.google_sub (Google's stable account id, the ID token's `sub` claim)
-- plus a unique index, for Google OAuth login (Stage 3).
--
-- Run this on EACH database (local, staging, prod) BEFORE deploying the code that
-- uses it: init_db()'s create_all only creates missing tables, it never adds
-- columns to an existing users table.
--
-- Idempotent — safe to run more than once. Example:
--   psql "postgresql://postgres:postgres@localhost:5432/dsa_trading" -f migrations/001_users_google_sub.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub);
