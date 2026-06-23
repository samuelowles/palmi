-- Palmi D1 — Rollback for 0002_add_auth_columns.sql
-- Removes `auth_version` and `last_auth_at` from the `users` table.
--
-- SQLite ≥ 3.35.0 and D1 (libSQL) both support ALTER TABLE ... DROP COLUMN.
-- Unlike DROP INDEX / DROP TABLE, DROP COLUMN has no IF EXISTS form, so
-- this file is NOT independently idempotent — re-running it after a
-- successful rollback will raise "no such column" on the second ALTER.
--
-- The verify script (`scripts/migrate-verify.mjs`) only runs each DOWN
-- once per cycle (between fresh UP and re-UP), so non-idempotency is
-- acceptable here. If you ever need to re-run a DOWN by hand after a
-- partial failure, run the statements one at a time and ignore errors.

ALTER TABLE users DROP COLUMN auth_version;
ALTER TABLE users DROP COLUMN last_auth_at;
