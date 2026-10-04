-- 002_user_data.sql
--
-- Per-user synced localStorage entries (Stage 4: account sync). One row per
-- (user, key); `value` is the exact localStorage string (TEXT, never parsed),
-- `version` drives optimistic concurrency, `updated_at` is epoch ms.
--
-- init_db()'s create_all also creates this table on startup (it is a new table,
-- not a column change), so running this file is optional — it is the record of
-- the schema and matches app/models/user_data.py.
--
-- Idempotent — safe to run more than once. Example:
--   psql "postgresql://postgres:postgres@localhost:5432/dsa_trading" -f migrations/002_user_data.sql

CREATE TABLE IF NOT EXISTS user_data (
    user_id    BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key        VARCHAR(200) NOT NULL,
    value      TEXT         NOT NULL,
    version    INTEGER      NOT NULL,
    updated_at BIGINT       NOT NULL,
    PRIMARY KEY (user_id, key)
);
