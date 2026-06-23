# Palmi D1 Migration Log

This file is the canonical, human-readable index of every D1 migration
shipped by the `palmi-api` worker. It is the traceability log referenced
by [issue #25](https://github.com/samuelowles/palmi/issues/25) acceptance
criterion 3 ("Migration log committed for traceability").

## Layout

```
cloudflare/migrations/
├── MIGRATIONS.md              ← this file (log)
├── 0001_initial.sql           ← forward / "up" scripts (applied by wrangler)
├── 0002_add_auth_columns.sql
├── 0003_add_composite_indexes.sql
└── down/                      ← rollback / "down" scripts (NOT applied by wrangler)
    ├── 0001_initial.sql
    ├── 0002_add_auth_columns.sql
    └── 0003_add_composite_indexes.sql
```

`migrations/down/` lives in a subdirectory because `wrangler d1 migrations apply`
only enumerates `*.sql` files directly inside the migrations folder (non-recursive
directory read — verified against `wrangler@4.90.0`'s `getMigrationNames` in
`src/d1/migrations/helpers.ts`). Keeping DOWN files in a subdirectory guarantees
wrangler will never try to apply them.

## Migrations

| # | Up script | Down script | Purpose |
|---|---|---|---|
| 0001 | `0001_initial.sql` | `down/0001_initial.sql` | `users`, `readings`, `synergy_results`, `analytics_events` tables and their equality indexes. |
| 0002 | `0002_add_auth_columns.sql` | `down/0002_add_auth_columns.sql` | Add `auth_version` (INTEGER) and `last_auth_at` (TEXT) to `users`. |
| 0003 | `0003_add_composite_indexes.sql` | `down/0003_add_composite_indexes.sql` | Composite `(user_id, created_at DESC)` indexes on `readings` and `analytics_events` for list-mine / recent-first queries. |

## Applying / rolling back

### Forward (production)

```bash
# Live D1 (Cloudflare):
npm --prefix cloudflare run db:migrate
# (alias for: wrangler d1 migrations apply palmi-db)
```

### Rollback (manual)

```bash
# Apply the matching down/<name>.sql against the live DB.
# Wrangler does not have a native "down" — invoke each file via:
wrangler d1 execute palmi-db --file=cloudflare/migrations/down/0001_initial.sql
```

The DOWN files must be applied in **reverse order** (newest first).

## Verifying reversibility (issue #25)

`cloudflare/scripts/migrate-verify.mjs` exercises the full
**apply → drop → reapply** cycle on a fresh in-memory SQLite database (D1
is built on SQLite, and `node:sqlite` exercises the same SQL semantics
locally — no Cloudflare credentials required).

```bash
npm --prefix cloudflare run db:migrate:verify
```

A successful run prints:

```
OK: migrations are reversible — apply / drop / reapply cycle matches.
```

The script asserts all three acceptance criteria from issue #25:

1. **Apply → drop → reapply cycle succeeds on a fresh local D1** — re-applying
   the UP migrations after a DOWN produces an identical schema snapshot.
2. **No orphaned indexes or tables after rollback** — after applying every
   DOWN file in reverse, `sqlite_master` contains zero user-defined tables
   or indexes (only `sqlite_%` internals remain).
3. **Migration log committed for traceability** — this file is committed.
