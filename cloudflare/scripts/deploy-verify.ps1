# deploy-verify.ps1 — Deploys the palmi-api worker and verifies the / health endpoint.
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
#   3. $env:WORKER_URL set to the deployed workers.dev URL, OR pass it as -WorkerUrl.
#      Example: https://palmi-api.<your-subdomain>.workers.dev
#
# Usage:
#   .\scripts\deploy-verify.ps1
#   .\scripts\deploy-verify.ps1 -WorkerUrl "https://palmi-api.example.workers.dev"
#   $env:WORKER_URL="https://palmi-api.example.workers.dev"; .\scripts\deploy-verify.ps1

[CmdletBinding()]
param(
  [string]$WorkerUrl
)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not $WorkerUrl) {
  $WorkerUrl = $env:WORKER_URL
}

if (-not $WorkerUrl) {
  Write-Error "WORKER_URL is not set. Pass -WorkerUrl or set `$env:WORKER_URL (e.g. https://palmi-api.<subdomain>.workers.dev)."
  exit 2
}

Write-Host "==> Deploying palmi-api worker..."
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
  Write-Error "wrangler deploy failed with exit code $LASTEXITCODE."
  exit 1
}

$WorkerUrl = $WorkerUrl.TrimEnd("/")
$HealthUrl = "$WorkerUrl/"

Write-Host "==> Verifying health endpoint at $HealthUrl"

try {
  $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 30
  $statusCode = 200
  $body = ($response | ConvertTo-Json -Compress -Depth 10)
} catch {
  $statusCode = 0
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }
  Write-Host "    HTTP $statusCode"
  Write-Error "Health request failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "    HTTP $statusCode"
Write-Host "    Body: $body"

if ($statusCode -ne 200) {
  Write-Error "FAIL: health endpoint returned HTTP $statusCode (expected 200)."
  exit 1
}

$expected = '{"status":"ok","service":"palmi-api","version":"1.0.0"}'
if ($body -ne $expected) {
  Write-Error "FAIL: health body mismatch.`n  expected: $expected`n  actual:   $body"
  exit 1
}

Write-Host "OK: deploy verified, health endpoint correct."
exit 0
