-- Palmi D1 — Rollback for 0003_add_composite_indexes.sql
-- Drops the composite (user_id, created_at DESC) indexes added in 0003.
-- Idempotent (uses IF EXISTS); safe to re-run.

DROP INDEX IF EXISTS idx_readings_user_created;
DROP INDEX IF EXISTS idx_analytics_events_user_created;
