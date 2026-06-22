# Palmi API — Cloudflare Worker

Single-source-of-truth deploy runbook for the **palmi-api** Cloudflare Worker.
This file supersedes `docs/DEPLOY.md` Phase 1 (sections 1.1–1.7) for the
Cloudflare-specific steps. If they ever disagree, the canonical commands live
here.

## Overview

`palmi-api` is the Hono-based Cloudflare Worker that backs the Palmi iOS app.
It exposes palm-vision, reading lookup, bestie-synergy, analytics ingest, and
RevenueCat webhook endpoints, and is bound to a D1 database (SQLite) and a KV
namespace (rate limiting + session tokens).

- **Worker name:** `palmi-api`
- **Routes:** `/api/read-palm`, `/api/reading/:id`, `/api/synergy`,
  `/api/analytics`, `/api/webhook/rc`, `/` (health)
- **Bindings:** `DB` (D1 — `palmi-db`), `KV` (KV namespace)
- **Default URL:** `https://palmi-api.<account-subdomain>.workers.dev`

## Prerequisites

- Cloudflare account on the **Workers Paid** plan ($5/mo) — required for D1 +
  KV + secrets on a custom-domain origin.
- **Node.js 20+** and **npm 10+**.
- **Wrangler 4.14+** (installed transitively via `npm install` in this dir).
- API credentials for the four required secrets — see [Secrets](#4-secrets).

## First-time setup

All commands assume you are running from the `cloudflare/` directory:

```bash
cd cloudflare
npm install
```

### 1. Login

Authenticates Wrangler against your Cloudflare account via the browser.

```bash
npx wrangler login
```

**Expected output:**

```
⛅️ wrangler 4.14.0 (update available 4.x.y)
Attempting to login via OAuth...
Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?...
✅ Successfully logged in.
```

You should see a browser tab open, ask you to confirm "Allow Wrangler", and
return to the terminal with the success line.

**Confirms:** local `~/.config/.wrangler/config/default.toml` now holds a valid
OAuth token; subsequent commands will not re-prompt.

### 2. D1 database

Creates the SQLite-compatible D1 instance used by `users`, `readings`, and
`synergy` tables.

```bash
npx wrangler d1 create palmi-db
```

**Expected output:**

```
🌀 Creating database "palmi-db"...
✅ Successfully created DB 'palmi-db' in region ENAM
Created your new D1 database.

[[d1_databases]]
binding = "DB" # i.e. available in your Worker on env.DB
database_name = "palmi-db"
database_id = "<uuid-here>" # ← paste this into wrangler.toml
```

**Confirms:** the `database_id` printed above must be pasted into
`wrangler.toml` → `[[d1_databases]].database_id`. Until that value matches the
remote, every Worker request that touches the DB will throw "D1 binding
missing".

### 3. KV namespace

Creates the KV bucket used for rate-limit counters and short-lived session
tokens.

```bash
npx wrangler kv:namespace create PALMI_KV
```

**Expected output:**

```
🌀 Creating namespace with title "palmi-kv"
✅ Successfully created KV namespace
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "KV"
id = "<hex-id-here>"
```

**Confirms:** the `id` printed above must be pasted into
`wrangler.toml` → `[[kv_namespaces]].id`. The binding name `KV` (capitalised)
is what the Worker source code uses; do not rename it.

### 4. Secrets

Secrets are stored encrypted by Cloudflare and injected at runtime as env
vars. **Never commit secret values to the repo.** You will be prompted
interactively to paste each value — the input is hidden.

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY   # optional — bot protection
```

For each, paste the value at the prompt and press Enter.

**Expected output (per secret):**

```
🌀 Creating the secret for the Worker "palmi-api"
✨ Success! Uploaded secret OPENAI_API_KEY
```

**Confirms:** each secret is now available to the Worker via `env.OPENAI_API_KEY`
etc. The required list above is taken from `wrangler.toml`'s comment block;
`TURNSTILE_SECRET_KEY` is the only optional one (skip if not using Turnstile).

### 5. Deploy

Applies the D1 migrations and ships the Worker script to the edge.

```bash
npx wrangler d1 migrations apply palmi-db --remote
npx wrangler deploy
```

**Expected output (deploy):**

```
⛅️ wrangler 4.14.0
Total Upload: 12.34 KiB / gzip: 4.56 KiB
Uploaded palmi-api (1.23 sec)
Published palmi-api (0.45 sec)
  https://palmi-api.<account-subdomain>.workers.dev
Current Version ID: <version-uuid>
```

**Confirms:** the `https://palmi-api.*.workers.dev` URL is your live endpoint.
Save it — you'll need it for `app/constants/config.ts` (`apiBaseUrl`) and the
RevenueCat webhook target.

### 6. Verify

Hit the health route. The response body must include the service name and the
matching `package.json` version.

```bash
curl https://palmi-api.<account-subdomain>.workers.dev/
```

**Expected output:**

```json
{"status":"ok","service":"palmi-api","version":"1.0.0"}
```

**Confirms:** the Worker is live, secrets are readable, and D1 + KV bindings
are resolvable. If `version` does not match the `package.json` version, the
deploy did not pick up the latest source — re-run `wrangler deploy`.

## Daily operations

### View logs

Streams live request logs (request method, path, status, latency, console.log
output). Press `Ctrl+C` to stop.

```bash
npx wrangler tail palmi-api
```

Filter to errors only:

```bash
npx wrangler tail palmi-api --status error --format pretty
```

### View deployments

Lists the 10 most recent deployments with version IDs and timestamps.

```bash
npx wrangler deployments list
```

### View bindings

Lists D1 + KV + secret bindings attached to the current Worker.

```bash
npx wrangler deployments status
```

### Rollback / disable

Two procedures cover the two real-world failure modes.

#### Rollback to a previous deployment

**When to use:** the latest deploy introduced a regression (5xx spike, bad
binding, wrong secret) and you want to swap back to the previous working
version **without downtime**.

```bash
npx wrangler rollback --message "revert: bad AI prompt"
```

If you want to revert further back, pass a specific `VERSION_ID` (find via
`wrangler deployments list`):

```bash
npx wrangler rollback <VERSION_ID> --message "revert to last-known-good"
```

**Expected output:**

```
⛅️ wrangler 4.14.0
↩️  Rolling back to deployment <version-uuid-or-id>
✅ Successfully rolled back.
```

#### Take the worker fully offline

**When to use:** a critical security incident, an LLM cost explosion, or a
forced compliance window where the API must return no traffic at all. This
**deletes the Worker** and frees all associated resources — you will need to
re-run steps 2–6 to bring it back.

```bash
npx wrangler delete --name palmi-api
```

**Expected output:**

```
⛅️ wrangler 4.14.0
⚠️  Are you sure you want to delete palmi-api? This action cannot be undone.
    (y/n)
✅ Successfully deleted palmi-api
```

To stop traffic but keep the script + bindings in place, deploy a no-op
instead: replace `src/index.ts` with a stub returning `503` and run
`npx wrangler deploy`. You can then revert with `wrangler rollback` without
re-creating the Worker.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy fails with `D1 binding missing` or `env.DB is undefined` | `database_id` in `wrangler.toml` does not match the remote DB, or step 2 was skipped | Re-run `npx wrangler d1 create palmi-db` and paste the printed `database_id` into `[[d1_databases]].database_id` |
| Runtime error `KV namespace 404` or `env.KV.get is not a function` | `id` in `wrangler.toml` does not match the remote namespace, or step 3 was skipped | Re-run `npx wrangler kv:namespace create PALMI_KV` and paste the printed `id` into `[[kv_namespaces]].id` |
| `POST /api/read-palm` returns `401` from OpenAI | `OPENAI_API_KEY` not set, or set against the wrong environment | Re-run `npx wrangler secret put OPENAI_API_KEY` from `cloudflare/` (the default targets the `palmi-api` production worker) |
| Health endpoint returns 404 on first deploy | Route `/` is not registered in the Worker source, or the deploy URL was typed wrong | Confirm `curl` URL matches the `https://palmi-api.<account-subdomain>.workers.dev` line printed by `wrangler deploy` |
| `wrangler login` hangs or browser never opens | Headless / SSH session, or OAuth callback blocked | Use `npx wrangler login --browser=false` and paste the device-code URL manually, or export `CLOUDFLARE_API_TOKEN` with Workers Scripts:Edit scope and use that instead |
| `wrangler deploy` reports `Authentication error [code: 10000]` | OAuth token expired (default ~30 days) | Re-run `npx wrangler login` |

## See also

- `docs/DEPLOY.md` — full multi-phase release checklist (RevenueCat, App Store
  Connect, EAS Build, post-submission).
- `docs/ARCHITECTURE.md` — system overview, route map, data flow.
- `docs/AI_RULES.md` — security rules (no client-side API keys, image handling,
  Turnstile usage).
