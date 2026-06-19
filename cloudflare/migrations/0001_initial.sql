-- Palmi D1 Schema — Initial Migration
-- Users, readings, and synergy results

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_pro INTEGER NOT NULL DEFAULT 0,
  subscription_expires TEXT,
  device_id TEXT,
  last_active TEXT,
  acquisition_source TEXT,
  net_ltv REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON blob of full reading
  estimated_ai_cost REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS synergy_results (
  id TEXT PRIMARY KEY,
  reading_id_a TEXT NOT NULL,
  reading_id_b TEXT NOT NULL,
  score INTEGER NOT NULL,
  match_label TEXT NOT NULL,
  data TEXT NOT NULL, -- JSON blob of full result
  estimated_ai_cost REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reading_id_a) REFERENCES readings(id),
  FOREIGN KEY (reading_id_b) REFERENCES readings(id)
);

CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id);
CREATE INDEX IF NOT EXISTS idx_synergy_readings ON synergy_results(reading_id_a, reading_id_b);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  event TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event);
