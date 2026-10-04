-- 003_user_profile.sql
--
-- Adds profile fields (first/last name, phone, country, Google avatar URL) and
-- users.token_version for session revocation (password change, "log out of all
-- devices"). Every JWT carries the version it was issued at; a mismatch is 401.
--
-- MANDATORY: run this on EACH database (local, staging, prod) BEFORE deploying the
-- code that uses it: init_db()'s create_all only creates missing tables, it never
-- adds columns to an existing users table.
--
-- Idempotent — safe to run more than once. Example:
--   psql "postgresql://postgres:postgres@localhost:5432/dsa_trading" -f migrations/003_user_profile.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
