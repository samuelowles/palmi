#!/usr/bin/env bash
# deploy-verify.sh — Deploys the palmi-api worker and verifies the / health endpoint.
#
# IMPORTANT: This script must be run by a human with Cloudflare credentials.
# Agents cannot run `wrangler deploy` because they don't have wrangler auth or
# the required secret values.
#
# Prerequisites:
#   1. `npx wrangler login` completed (browser OAuth with Cloudflare).
#   2. All required secrets set via `wrangler secret put <NAME>`:
#        - OPENAI_API_KEY
#        - DEEPSEEK_API_KEY
#        - REVENUECAT_WEBHOOK_SECRET
#        - JWT_SECRET
#      Optional: TURNSTILE_SECRET_KEY
#   3. WORKER_URL exported to the deployed workers.dev URL, OR pass it as $1.
#      Example: https://palmi-api.<your-subdomain>.workers.dev
#
# Usage:
#   ./scripts/deploy-verify.sh
#   ./scripts/deploy-verify.sh "https://palmi-api.example.workers.dev"
#   WORKER_URL="https://palmi-api.example.workers.dev" ./scripts/deploy-verify.sh
#
# Dry-run mode (offline / lintable):
#   DEPLOY_DRY_RUN=1 WORKER_URL="https://palmi-api.example.workers.dev" \
#     ./scripts/deploy-verify.sh
#   Skips wrangler deploy and reads the health body from
#   scripts/tests/fixtures/health-ok.json instead of the live URL. Useful for
#   CI lint and for verifying the script's logic without Cloudflare creds.

set -euo pipefail

# Capture the script's own directory BEFORE we cd, then change to its parent
# (the cloudflare/ root). After the cd, $0 is unchanged but the cwd is now
# cloudflare/, so any FIXTURE/HEALTH_URL path that is relative to $0 will
# resolve against the wrong base — compute paths from SCRIPT_DIR instead.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Accept WORKER_URL from arg or env; otherwise require it.
if [ "${1-}" != "" ]; then
  WORKER_URL="$1"
fi

if [ "${WORKER_URL-}" = "" ]; then
  echo "ERROR: WORKER_URL is not set." >&2
  echo "       Export WORKER_URL=https://palmi-api.<subdomain>.workers.dev" >&2
  echo "       or pass it as the first argument." >&2
  exit 2
fi

DRY_RUN="${DEPLOY_DRY_RUN:-0}"

# Strip any trailing slash for the final concatenation.
WORKER_URL="${WORKER_URL%/}"
HEALTH_URL="${WORKER_URL}/"

if [ "$DRY_RUN" = "1" ]; then
  echo "==> DEPLOY_DRY_RUN=1: skipping wrangler deploy"
  FIXTURE="$SCRIPT_DIR/tests/fixtures/health-ok.json"
  if [ ! -f "$FIXTURE" ]; then
    echo "FAIL: dry-run fixture missing: $FIXTURE" >&2
    exit 1
  fi
  TMP_BODY="$FIXTURE"
  HTTP_CODE="200"
else
  echo "==> Deploying palmi-api worker..."
  npx wrangler deploy

  echo "==> Verifying health endpoint at ${HEALTH_URL}"
  TMP_BODY="$(mktemp)"
  trap 'rm -f "$TMP_BODY"' EXIT

  HTTP_CODE=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" "$HEALTH_URL")
fi

echo "    HTTP ${HTTP_CODE}"
echo "    Body: $(cat "$TMP_BODY")"

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: health endpoint returned HTTP ${HTTP_CODE} (expected 200)." >&2
  exit 1
fi

# JSON shape check — resilient to property ordering and semver bumps.
# (An exact-string match fails because some clients re-serialize keys
# alphabetically.) Uses grep -E; requires GNU grep or macOS BSD grep (both OK).
BODY="$(cat "$TMP_BODY")"

if ! printf '%s' "$BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "FAIL: health body.status expected 'ok'." >&2
  echo "  body: $BODY" >&2
  exit 1
fi
if ! printf '%s' "$BODY" | grep -Eq '"service"[[:space:]]*:[[:space:]]*"palmi-api"'; then
  echo "FAIL: health body.service expected 'palmi-api'." >&2
  echo "  body: $BODY" >&2
  exit 1
fi
if ! printf '%s' "$BODY" | grep -Eq '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"'; then
  echo "FAIL: health body.version expected semver (e.g. 1.0.0)." >&2
  echo "  body: $BODY" >&2
  exit 1
fi

echo "OK: deploy verified, health endpoint correct."
