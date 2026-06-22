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
2. `GET <worker-url>/` returned HTTP 200 with body
   `{"status":"ok","service":"palmi-api","version":"1.0.0"}` exactly.

The exact body match is intentional — it's the acceptance criterion for
[issue #18](https://github.com/samuelowles/palmi/issues/18). If the worker
ships a different shape (e.g. version bumps, extra fields), update both
`src/index.ts` and the `EXPECTED` constant in the scripts.

## What to do on failure

The script exits non-zero with one of two messages:

| Failure | Likely cause | First action |
|---|---|---|
| `wrangler deploy` non-zero | Missing/invalid secret, account mismatch, build error | Re-read the wrangler output; check that all four secrets are set with `npx wrangler secret list`. |
| `HTTP <code> (expected 200)` | Worker deployed but URL wrong, DNS not propagated, or routing broke | Confirm `WORKER_URL` matches what `wrangler deploy` printed. |
| `health body mismatch` | `src/index.ts` `/` handler changed | Compare `src/index.ts` line ~51 against the `EXPECTED` body in this script. |

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
