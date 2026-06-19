# Palmi — Execution Plan

## Current Status: Phase 1-6 Complete ✅

The app is fully scaffolded and compiles with zero TypeScript errors.
Metro bundler successfully bundles 1,191 modules for web preview.

## What's Built

### Frontend (React Native Expo SDK 54)
- **6 screens:** Splash → Capture → Reading → Paywall → Compare → Settings
- **4 components:** GlassCard, PalmOverlay, BlurOverlay, CompatibilityCard
- **2 stores:** userStore (auth/subscription), readingStore (readings/history)
- **2 services:** api.ts (CF Workers client), revenue.ts (RevenueCat SDK)
- **Design system:** Theme tokens, Space Grotesk + DM Serif Display fonts
- **Native integrations:** Camera, haptics, sharing, clipboard

### Backend (Cloudflare Workers)
- **Hono router** with 4 route groups
- **GPT-5.4-mini** palm vision analysis with structured JSON output
- **DeepSeek V4 Flash** text synthesis (Gen-Z voice), batched at 3 concurrent
- **Synergy engine** for bestie compatibility (deterministic, tested)
- **RevenueCat webhook** handler (constant-time auth, proper state machine)
- **D1 schema** with users, readings, synergy, analytics_events tables
- **Rate limiting** via KV middleware on AI endpoints
- **Server-side subscription gating** on reading and synergy endpoints
- **82 unit tests** across 4 test suites (zero errors)

### Legal & Compliance
- Privacy Policy (GDPR/CCPA)
- Terms of Service (auto-renewal terms)

## Next Steps (Your Action Required)

### 1. Fix Package Versions ✅ Done
All Expo SDK 54 compatible versions are now installed.

### 2. Deploy Cloudflare Worker
```bash
cd cloudflare
wrangler login
wrangler d1 create palmi-db        # Copy database_id to wrangler.toml
wrangler kv namespace create PALMI_KV  # Copy id to wrangler.toml
wrangler d1 migrations apply palmi-db
wrangler secret put OPENAI_API_KEY
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put REVENUECAT_WEBHOOK_SECRET
wrangler secret put TURNSTILE_SECRET_KEY
wrangler deploy
```

### 3. Set Up RevenueCat
1. Create RevenueCat project at app.revenuecat.com
2. Add iOS app with bundle ID `com.palmi.app`
3. Create product `palmi_pro_weekly` ($1.99/week)
4. Create entitlement `pro`
5. Copy API key to app config

### 4. EAS Build
```bash
cd app
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile preview
```

### 5. TestFlight → App Store
1. Download from EAS and test on physical iPhone
2. Configure App Store Connect metadata
3. `npx eas-cli submit --platform ios`
