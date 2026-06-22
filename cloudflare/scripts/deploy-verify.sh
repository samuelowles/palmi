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

set -euo pipefail

cd "$(dirname "$0")/.."

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

echo "==> Deploying palmi-api worker..."
npx wrangler deploy

# Strip any trailing slash for the final concatenation.
WORKER_URL="${WORKER_URL%/}"
HEALTH_URL="${WORKER_URL}/"

echo "==> Verifying health endpoint at ${HEALTH_URL}"
TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

HTTP_CODE=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" "$HEALTH_URL")
echo "    HTTP ${HTTP_CODE}"
echo "    Body: $(cat "$TMP_BODY")"

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: health endpoint returned HTTP ${HTTP_CODE} (expected 200)." >&2
  exit 1
fi

EXPECTED='{"status":"ok","service":"palmi-api","version":"1.0.0"}'
ACTUAL="$(cat "$TMP_BODY")"

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "FAIL: health body mismatch." >&2
  echo "  expected: $EXPECTED" >&2
  echo "  actual:   $ACTUAL" >&2
  exit 1
fi

echo "OK: deploy verified, health endpoint correct."
