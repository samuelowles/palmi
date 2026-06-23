#!/usr/bin/env node
/**
 * migrate-verify.mjs — Verify D1 migration reversibility locally.
 *
 * Issue #25 (E2.6) acceptance criteria:
 *   1. Apply → drop → reapply cycle succeeds on a fresh local D1
 *   2. No orphaned indexes or tables after rollback
 *   3. Migration log committed for traceability  (see MIGRATIONS.md)
 *
 * What this script does, end-to-end:
 *   - Spins up an in-memory SQLite database (D1 is built on SQLite;
 *     `node:sqlite` exercises the same SQL semantics locally, with no
 *     Cloudflare credentials required).
 *   - Applies every UP migration in `migrations/*.sql` in lexicographic order.
 *   - Snapshots the user-visible schema (tables + indexes).
 *   - Applies every DOWN migration in `migrations/down/*.sql` in REVERSE order.
 *   - Asserts the schema is empty (no orphan tables or indexes).
 *   - Re-applies every UP migration.
 *   - Asserts the final schema matches the first snapshot byte-for-byte.
 *
 * Exit codes:
 *   0 — cycle succeeded, schema matches, no orphans.
 *   1 — any check failed (with a `FAIL: …` line on stderr).
 *
 * Usage:
 *   node scripts/migrate-verify.mjs
 *   # or
 *   npm run db:migrate:verify
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve paths relative to this script, not the caller's cwd, so the
// script works whether invoked from cloudflare/ or from anywhere else.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLOUDFLARE_ROOT = join(__dirname, '..');
const UP_DIR = join(CLOUDFLARE_ROOT, 'migrations');
const DOWN_DIR = join(UP_DIR, 'down');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Sorted list of .sql files directly in `dir` (non-recursive). */
function readSqlDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Sorted, JSON-stable snapshot of user-visible tables + indexes. */
function snapshotSchema(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master " +
        "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
        "ORDER BY name"
    )
    .all()
    .map((r) => r.name);
  const indexes = db
    .prepare(
      "SELECT name FROM sqlite_master " +
        "WHERE type = 'index' AND name NOT LIKE 'sqlite_%' " +
        "ORDER BY name"
    )
    .all()
    .map((r) => r.name);
  return { tables, indexes };
}

function info(msg) {
  console.log(`==> ${msg}`);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// preflight: ensure every UP file has a matching DOWN
// ---------------------------------------------------------------------------

info(`Reading UP migrations from ${UP_DIR}`);
info(`Reading DOWN migrations from ${DOWN_DIR}`);

const upFiles = readSqlDir(UP_DIR);
const downFiles = readSqlDir(DOWN_DIR);

if (upFiles.length === 0) {
  fail(`no UP migrations found in ${UP_DIR}`);
}
if (downFiles.length !== upFiles.length) {
  fail(
    `migration count mismatch: ${upFiles.length} UP file(s) vs ` +
      `${downFiles.length} DOWN file(s) — every UP must have a matching DOWN`
  );
}
for (const f of upFiles) {
  if (!downFiles.includes(f)) {
    fail(`no matching DOWN for ${f} (expected down/${f})`);
  }
}

// ---------------------------------------------------------------------------
// Step 1: fresh DB, apply every UP migration in order.
// ---------------------------------------------------------------------------

info('Step 1: apply UP migrations on a fresh in-memory D1');
const db = new DatabaseSync(':memory:');

for (const f of upFiles) {
  const sql = readFileSync(join(UP_DIR, f), 'utf8');
  info(`  up   ${f}`);
  db.exec(sql);
}

const firstSnapshot = snapshotSchema(db);
info(
  `  schema after UP: ${firstSnapshot.tables.length} table(s), ` +
    `${firstSnapshot.indexes.length} index(es)`
);
if (firstSnapshot.tables.length === 0) {
  fail('no tables created by UP migrations — migrations look like no-ops');
}

// ---------------------------------------------------------------------------
// Step 2: apply every DOWN migration in REVERSE order.
// ---------------------------------------------------------------------------

info('Step 2: apply DOWN migrations (reverse order) — rollback');
for (const f of [...downFiles].reverse()) {
  const sql = readFileSync(join(DOWN_DIR, f), 'utf8');
  info(`  down ${f}`);
  db.exec(sql);
}

const postDownSnapshot = snapshotSchema(db);
info(
  `  schema after DOWN: ${postDownSnapshot.tables.length} table(s), ` +
    `${postDownSnapshot.indexes.length} index(es)`
);

if (postDownSnapshot.tables.length !== 0 || postDownSnapshot.indexes.length !== 0) {
  fail(
    `orphan schema after rollback — ` +
      `tables=${JSON.stringify(postDownSnapshot.tables)}, ` +
      `indexes=${JSON.stringify(postDownSnapshot.indexes)}`
  );
}

// ---------------------------------------------------------------------------
// Step 3: re-apply UP and verify the schema matches Step 1.
// ---------------------------------------------------------------------------

info('Step 3: re-apply UP migrations and verify schema matches Step 1');
for (const f of upFiles) {
  const sql = readFileSync(join(UP_DIR, f), 'utf8');
  info(`  up   ${f}`);
  db.exec(sql);
}

const finalSnapshot = snapshotSchema(db);
if (JSON.stringify(finalSnapshot) !== JSON.stringify(firstSnapshot)) {
  fail(
    `schema drift after re-apply — ` +
      `first=${JSON.stringify(firstSnapshot)}, ` +
      `final=${JSON.stringify(finalSnapshot)}`
  );
}

db.close();

console.log('OK: migrations are reversible — apply / drop / reapply cycle matches.');
