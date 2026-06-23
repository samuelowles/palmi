-- Palmi D1 Migration 0003
-- Add composite (user_id, created_at DESC) indexes to support
-- the most common read patterns:
--   * Reading history queries: WHERE user_id = ? ORDER BY created_at DESC
--   * Analytics event timeline per user: WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC
--
-- Speeds up list-mine / recent-first scans; complements the existing
-- single-column indexes (idx_readings_user, idx_analytics_events_user)
-- which only help equality on user_id.

CREATE INDEX IF NOT EXISTS idx_readings_user_created
  ON readings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON analytics_events (user_id, created_at DESC);
