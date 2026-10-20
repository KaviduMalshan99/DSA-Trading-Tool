-- 004_subscriptions.sql
--
-- Subscriptions: users.trial_ends_at / users.subscription_ends_at (epoch ms) and the
-- payments table (OnePay). The Payment model arrives with the OnePay code; the table
-- is created here so the schema is on record in one place.
--
-- MANDATORY: run this on EACH database (local, staging, prod) BEFORE deploying the
-- code that uses it: init_db()'s create_all only creates missing tables, it never
-- adds columns to an existing users table. Run it AGAIN right after the deploy: the
-- backfill only fills NULLs, so the second run catches users who signed up through
-- the old code in between. Existing users' 7-day trial starts when this runs.
--
-- Idempotent — safe to run more than once. Example:
--   psql "postgresql://postgres:postgres@localhost:5432/dsa_trading" -f migrations/004_subscriptions.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at BIGINT;

-- 7 days must match TRIAL_DAYS (backend/app/core/config.py trial_days). Only NULLs
-- are filled, so a rerun never extends or resets anyone's trial.
UPDATE users
SET trial_ends_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint + 7 * 86400000
WHERE trial_ends_at IS NULL;

-- Financial records: RESTRICT so a user row can't be deleted out from under them.
CREATE TABLE IF NOT EXISTS payments (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    reference          VARCHAR(64) NOT NULL UNIQUE,   -- ours, sent to OnePay
    ipg_transaction_id VARCHAR(64) UNIQUE,            -- OnePay's, from the create response
    amount             NUMERIC(10, 2) NOT NULL,       -- price at checkout time
    currency           VARCHAR(3) NOT NULL DEFAULT 'LKR',
    status             VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending | paid | failed | cancelled (| refunded)
    created_at         BIGINT NOT NULL,               -- epoch ms
    paid_at            BIGINT,
    period_start       BIGINT,
    period_end         BIGINT,
    last_checked_at    BIGINT,                        -- throttles status-API calls
    last_status_json   TEXT                           -- raw status/create response, for audit
);

CREATE INDEX IF NOT EXISTS ix_payments_user_id_created_at ON payments (user_id, created_at);
