# `cloudflare/scripts/`

Deployment + health-verification helpers for the `palmi-api` Cloudflare Worker.

## Why these scripts exist

The actual `wrangler deploy` must be run by a **human** — agents cannot run it
because they don't have wrangler OAuth credentials, the Cloudflare account ID
for the live deployment, or the values for the four required secrets:

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`
- `JWT_SECRET`

These scripts wrap that human-only command with a post-deploy health check so
the deploy step is one-shot and the success criterion is enforced
automatically.

## Prerequisites (one-time)

1. **Install dependencies** from `cloudflare/`:
   ```bash
   npm install
   ```
2. **Authenticate wrangler** (opens a browser):
   ```bash
   npx wrangler login
   ```
3. **Set the four required secrets** (and optionally the fifth):
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY   # optional
   ```
4. **Know your workers.dev URL**. After the first successful deploy, wrangler
   prints a URL of the form `https://palmi-api.<your-subdomain>.workers.dev`.
   Export it for the script:
   ```bash
   # bash / zsh
   export WORKER_URL="https://palmi-api.<your-subdomain>.workers.dev"
   ```
   ```powershell
   # PowerShell
   $env:WORKER_URL = "https://palmi-api.<your-subdomain>.workers.dev"
   ```

## Running the scripts

From the `cloudflare/` directory:

### macOS / Linux / WSL / CI

```bash
chmod +x scripts/deploy-verify.sh
./scripts/deploy-verify.sh
# or with an inline URL:
./scripts/deploy-verify.sh "https://palmi-api.<subdomain>.workers.dev"
```

### Windows (PowerShell)

```powershell
.\scripts\deploy-verify.ps1
# or with an inline URL:
.\scripts\deploy-verify.ps1 -WorkerUrl "https://palmi-api.<subdomain>.workers.dev"
```

## What success looks like

Both scripts end with the line:

```
OK: deploy verified, health endpoint correct.
```

That confirms two things:

1. `wrangler deploy` exited 0.
2. `GET <worker-url>/` returned HTTP 200 with a JSON body matching the
   acceptance shape for [issue #18](https://github.com/samuelowles/palmi/issues/18):
   `status="ok"`, `service="palmi-api"`, `version=<semver>` (e.g. `1.0.0`).

The scripts assert the JSON shape (status / service / semver `version`)
rather than the exact byte sequence, because some clients re-serialize
object keys alphabetically. If the worker ships a different shape (e.g.
service rename, extra fields), update `src/index.ts` — the scripts will
follow.

### Dry-run mode (offline / lintable)

The bash script supports a `DEPLOY_DRY_RUN=1` mode that skips
`wrangler deploy` and reads the health body from a local fixture:

```bash
DEPLOY_DRY_RUN=1 WORKER_URL="https://palmi-api.example.workers.dev" \
  ./scripts/deploy-verify.sh
```

This is useful for CI lint (no Cloudflare creds required) and for verifying
the URL-trim + body-assertion logic in isolation. The fixture lives at
`scripts/tests/fixtures/health-ok.json`.

## What to do on failure

The script exits non-zero with one of two messages:

| Failure | Likely cause | First action |
|---|---|---|
| `wrangler deploy` non-zero | Missing/invalid secret, account mismatch, build error | Re-read the wrangler output; check that all four secrets are set with `npx wrangler secret list`. |
| `HTTP <code> (expected 200)` | Worker deployed but URL wrong, DNS not propagated, or routing broke | Confirm `WORKER_URL` matches what `wrangler deploy` printed. |
| `health body.status / .service / .version` mismatch | `src/index.ts` `/` handler changed | Compare `src/index.ts` line ~51 against the JSON shape (status / service / semver version) this script asserts. |

After triage, paste the failing output into the issue thread or the DEPLOY
runbook (owned by E1.9).

## Files

| File | Purpose |
|---|---|
| `deploy-verify.sh` | POSIX bash wrapper — works on macOS, Linux, WSL, and most CI runners. |
| `deploy-verify.ps1` | PowerShell wrapper — works on Windows native shells. |
| `README.md` | This document. |

Neither script hardcodes account IDs, worker URLs, or credentials. Everything
sensitive is read from the wrangler auth context (`wrangler login`) and the
`WORKER_URL` env var.


## `migrate-verify.mjs` — local migration reversibility check

The `db:migrate:verify` script exercises the **apply → drop → reapply** cycle
on a fresh in-memory SQLite database (D1 is built on SQLite; `node:sqlite`
gives the same SQL semantics locally, with no Cloudflare credentials required).

This is the local check for [issue #25](https://github.com/samuelowles/palmi/issues/25)
acceptance criteria:

1. Apply → drop → reapply cycle succeeds on a fresh local D1
2. No orphaned indexes or tables after rollback
3. Migration log committed for traceability (see `cloudflare/migrations/MIGRATIONS.md`)

### Running

From the `cloudflare/` directory:

```bash
node scripts/migrate-verify.mjs
# or
npm run db:migrate:verify
```

A successful run prints:

```
OK: migrations are reversible — apply / drop / reapply cycle matches.
```

### How it works

| Step | Action | Assertion |
|---|---|---|
| 1 | Open `:memory:` SQLite DB, apply every `migrations/*.sql` in order. | Snapshot must contain ≥ 1 table. |
| 2 | Apply every `migrations/down/*.sql` in **reverse** order. | Snapshot must be empty (no orphan tables or indexes — only `sqlite_%` internals remain). |
| 3 | Re-apply every `migrations/*.sql`. | Snapshot must byte-match Step 1. |

### Prerequisites

- Node ≥ 22.5 (for `node:sqlite` — verified on Node 24).
- The paired UP / DOWN SQL files exist (one per migration, identical filename).
  Wrangler only reads `*.sql` directly inside `migrations/` (non-recursive),
  so the `migrations/down/` subdirectory is invisible to `wrangler d1 migrations apply`.

### What to do on failure

| Failure | Likely cause | First action |
|---|---|---|
| `migration count mismatch` | A new UP migration was added without a matching DOWN. | Add `migrations/down/<same-name>.sql` with the reverse DDL. |
| `orphan schema after rollback` | A DOWN migration didn't drop everything its UP created (e.g. missed an index or column). | Compare the offending UP file to its DOWN — every `CREATE` needs a matching `DROP`. |
| `schema drift after re-apply` | A UP migration is not idempotent against the schema its prior DOWN leaves behind. | Usually a missing `IF NOT EXISTS`, or an `ALTER TABLE` that depends on prior state. |