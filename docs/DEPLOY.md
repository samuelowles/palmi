# Palmi — Deployment Checklist

## Prerequisites

- [ ] Apple Developer account ($99/year, enrolled)
- [ ] RevenueCat account (free tier)
- [ ] Cloudflare Workers paid plan ($5/month)
- [ ] OpenAI API account with gpt-5.4-mini access
- [ ] DeepSeek API account

---

## Phase 1: Backend (Cloudflare Workers)

### 1.1 Install Wrangler & Login
```bash
cd cloudflare
npm install
npx wrangler login
```

### 1.2 Create D1 Database
```bash
npx wrangler d1 create palmi-db
# Copy the returned database_id into wrangler.toml → [[d1_databases]].database_id
```

### 1.3 Create KV Namespace
```bash
npx wrangler kv:namespace create PALMI_KV
# Copy the returned id into wrangler.toml → [[kv_namespaces]].id
```

### 1.4 Run Migrations
```bash
npx wrangler d1 migrations apply palmi-db
```

### 1.5 Set Secrets
Set each of the 5 required Worker secrets. See `cloudflare/docs/E1.4-secrets-procedure.md`
for full procedure, rotation notes, and local-dev (`.dev.vars`) instructions.

```bash
# Issue #14 — 4 required (per PRD §5.2 + docs/AI_RULES.md §Security)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY    # REQUIRED — bot protection for /api/read-palm

# Also required for the worker to start (5th secret, separate issue from #14)
npx wrangler secret put JWT_SECRET              # HMAC for auth tokens

# Verify
npx wrangler secret list
```

### 1.6 Deploy Worker
```bash
npx wrangler deploy
# Note the workers.dev URL (e.g., https://palmi-api.workers.dev)
```

### 1.7 Verify Backend
```bash
# Use the URL `wrangler deploy` printed (or `npx wrangler deployments list`).
# Placeholder — replace <your-subdomain> with the actual subdomain wrangler
# prints on first deploy.
curl https://palmi-api.<your-subdomain>.workers.dev/
# Should return: {"status":"ok","service":"palmi-api","version":"1.0.0"}
```

**Live URL (recorded from first deploy):** `https://palmi-api.<your-subdomain>.workers.dev`

> The actual subdomain is printed by `wrangler deploy` on first run and is
> also retrievable any time with `npx wrangler deployments list`. Replace
> `<your-subdomain>` above with the real value, then run the curl to confirm
> `200 OK` and the health body shape. The deploy-verify scripts
> (`cloudflare/scripts/deploy-verify.sh` / `.ps1`) accept the URL via the
> `WORKER_URL` env var.

---

## Phase 2: RevenueCat

### 2.1 Project Setup
- [ ] Create project at [app.revenuecat.com](https://app.revenuecat.com)
- [ ] Add iOS app with bundle ID: `com.palmi.app`
- [ ] Copy public SDK key → paste in `app/constants/config.ts` as `revenueCatApiKey`

### 2.2 Products & Entitlements
- [ ] Create product: `palmi_pro_weekly` — $1.99/week, 3-day free trial
- [ ] Create entitlement: `pro`
- [ ] Attach `palmi_pro_weekly` to `pro` entitlement

### 2.3 Webhook
- [ ] In RevenueCat → Integrations → add webhook URL: `https://your-worker.workers.dev/api/webhook/rc`
- [ ] Copy webhook secret → used in step 1.5 (`REVENUECAT_WEBHOOK_SECRET`)

---

## Phase 3: App Store Connect

### 3.1 App Registration
- [ ] Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- [ ] Create New App → iOS
- [ ] Name: **Palmi — AI Palm Reading**
- [ ] Bundle ID: `com.palmi.app`
- [ ] SKU: `palmi-app-001`
- [ ] Primary Category: Entertainment
- [ ] Secondary Category: Lifestyle

### 3.2 In-App Purchases
- [ ] Create IAP: `palmi_pro_weekly` — Auto-Renewable Subscription
- [ ] Price: $1.99/week with 3-day free trial
- [ ] This must match the RevenueCat product ID exactly

### 3.3 App Store Metadata
- [ ] Subtitle: *Your palm tells a story*
- [ ] Keywords: palm reading, palmistry, astrology, compatibility, personality, AI, hand analysis, love line, zodiac, fortune
- [ ] Screenshots (6.7" iPhone): splash, capture, reading, paywall, compare, settings
- [ ] Privacy Policy URL: `https://getpalmi.com/privacy`
- [ ] Terms of Service URL: `https://getpalmi.com/terms`
- [ ] App Review notes: explain that AI readings are for entertainment purposes only

### 3.4 App Privacy Labels
- [ ] Data collected: User ID (anonymous), palm photos (processed, not stored)
- [ ] No third-party data sharing
- [ ] Palm images: "Used for App Functionality" → "Not Linked to You"

---

## Phase 4: EAS Build & Submit

### 4.1 Configure EAS
```bash
cd app
npx eas-cli login
npx eas-cli build:configure
```

### 4.2 Update App Config
In `app/app.json`, verify:
- [ ] `expo.ios.bundleIdentifier` = `com.palmi.app`
- [ ] `expo.ios.buildNumber` = `1`
- [ ] `expo.version` = `1.0.0`
- [ ] `expo.ios.infoPlist.NSCameraUsageDescription` = `"To scan and analyze your palm lines"`
- [ ] `expo.ios.infoPlist.NSPhotoLibraryUsageDescription` = `"To save your reading cards"`
- [ ] `expo.ios.userInterfaceStyle` = `"dark"`

### 4.3 Build for TestFlight
```bash
npx eas-cli build --platform ios --profile preview
```
- [ ] Wait for build completion (EAS dashboard or CLI)
- [ ] Download to iPhone via TestFlight link

### 4.4 TestFlight Validation
- [ ] Test on physical iPhone (not simulator)
- [ ] Take a palm photo → verify reading flow works end to end
- [ ] Verify Heart + Head lines show free; Life Line shows blurred
- [ ] Tap "Unlock Life Line" → paywall appears (RevenueCat sandbox)
- [ ] Complete test purchase (sandbox account)
- [ ] Verify full reading unlocks
- [ ] Test "Compare with Bestie" → share link → open on another device
- [ ] Test "Restore Purchases" in Settings
- [ ] Kill app, reopen → verify reading history persists (AsyncStorage)
- [ ] Test error states: airplane mode → graceful error messages

### 4.5 Submit to App Store
```bash
npx eas-cli submit --platform ios
```

---

## Phase 5: Pre-Launch Validation

### 5.1 Legal
- [ ] Privacy Policy hosted at `https://getpalmi.com/privacy`
- [ ] Terms of Service hosted at `https://getpalmi.com/terms`
- [ ] Both pages are publicly accessible (App Review checks this)

### 5.2 Content
- [ ] All readings include "for entertainment purposes" disclaimer
- [ ] No medical, health, or financial claims in any copy
- [ ] No fortune-telling claims — frame as "personality insight" and "self-discovery"

### 5.3 RevenueCat Sandbox
- [ ] Purchase `palmi_pro_weekly` in sandbox
- [ ] Cancel subscription → verify access preserved until expiry
- [ ] Let subscription expire → verify pro access revoked
- [ ] Renew → verify pro access restored
- [ ] Check RevenueCat dashboard → events flowing correctly

### 5.4 Backend Monitoring
- [ ] Check Cloudflare Workers dashboard → requests coming through
- [ ] Check D1 → readings being stored with correct `user_id`
- [ ] Verify AI costs being logged (`estimated_ai_cost` column populated)
- [ ] Check rate limiting working (rapid-fire 6+ requests → 429 on 6th)

---

## Phase 6: Post-Submission

### 6.1 While Waiting for Review (24-48h typical)
- [ ] Prepare TikTok launch content (3-5 videos ready to post)
- [ ] Set up analytics dashboard (Hermes agent or manual)
- [ ] Test share-to-TikTok flow from app
- [ ] Monitor TestFlight for crash reports

### 6.2 After Approval
- [ ] Release to App Store (manual release if you want to coordinate with TikTok launch)
- [ ] Post TikTok content with app store link
- [ ] Pin comment: "palm reading app was the best one they found that does it for free"
- [ ] Monitor RevenueCat dashboard for first real subscription
- [ ] Check Cloudflare Workers for real traffic patterns
- [ ] Respond to first App Store reviews within 24h

---

## Cost Summary
| Item | Monthly Cost |
|---|---|
| Apple Developer | $8.25/mo ($99/yr) |
| Cloudflare Workers | $5/mo |
| OpenAI GPT-5.4-mini | ~$0.0025/reading |
| DeepSeek V4 Flash | ~$0.00007/reading |
| RevenueCat | Free (< $10K MTR) |
| **Total fixed** | **~$13.25/mo** |
| **Break-even** | **23 subscribers** ($45.77 revenue) |
