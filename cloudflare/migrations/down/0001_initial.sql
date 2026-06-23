-- Palmi D1 — Rollback for 0001_initial.sql
-- Drops every table and index introduced by 0001_initial.sql.
-- Idempotent (uses IF EXISTS everywhere); safe to re-run.
--
-- Drop order is the reverse of the create order in 0001_initial.sql:
-- indexes are dropped before tables, and tables that hold foreign keys
-- (synergy_results → readings → users) are dropped before their parents.
--
-- Wrangler only reads .sql files directly under `migrations/` (non-recursive),
-- so a `migrations/down/` subdirectory is safe and is not picked up by
-- `wrangler d1 migrations apply`.

DROP INDEX IF EXISTS idx_analytics_events_user;
DROP INDEX IF EXISTS idx_analytics_events_event;
DROP INDEX IF EXISTS idx_synergy_readings;
DROP INDEX IF EXISTS idx_readings_user;

DROP TABLE IF EXISTS synergy_results;
DROP TABLE IF EXISTS readings;
DROP TABLE IF EXISTS analytics_events;
DROP TABLE IF EXISTS users;
