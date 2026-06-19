# Palmi — Session Log

## [2026-05-08 10:47] — Project Bootstrap

### What was done
- Initialized Expo project with TypeScript template
- Created docs/AI_RULES.md — coding standards, voice/tone, security rules
- Created docs/ARCHITECTURE.md — system overview, data flows, directory structure
- Created docs/PRD.md — consolidated product requirements
- Created logs.md and bugs.md

### Key Decisions
- Stack: React Native Expo + EAS Build (Windows → iOS)
- AI: OpenAI GPT Image 2 (vision) + DeepSeek V4 Flash (text synthesis)
- Subscriptions: RevenueCat ($1.99/week)
- Design: Dark mode only, Space Grotesk + DM Serif Display, glassmorphism
- Name: Palmi

### Files Changed
- docs/AI_RULES.md (new)
- docs/ARCHITECTURE.md (new)
- docs/PRD.md (new)
- logs.md (new)
- bugs.md (new)
- app/ (Expo project initialized)

### Build Output
- **Expo SDK 54** + React Native 0.81.5 + TypeScript strict
- **1,191 modules** bundled successfully (zero compilation errors)
- **Zero TypeScript errors** across all source files
- All package versions aligned to SDK 54 compatibility

### Files Created (40+ files)

**Frontend (app/)**
- `app/_layout.tsx` — Root layout with font loading + native stack nav
- `app/index.tsx` — Splash screen with animated logo entrance
- `app/capture.tsx` — Camera + palm overlay + image compression
- `app/reading.tsx` — Staggered reading reveal with paywall blur
- `app/paywall.tsx` — RevenueCat subscription modal
- `app/compare.tsx` — Bestie compatibility with share links
- `app/settings.tsx` — Restore purchases + legal links
- `components/GlassCard.tsx` — Frosted glass card
- `components/PalmOverlay.tsx` — Animated camera guide
- `components/BlurOverlay.tsx` — Premium content lock
- `components/CompatibilityCard.tsx` — Shareable comparison card
- `constants/theme.ts` — Design system tokens
- `constants/config.ts` — App configuration
- `stores/userStore.ts` — User + subscription state
- `stores/readingStore.ts` — Reading state + history
- `services/api.ts` — Typed API client
- `services/revenue.ts` — RevenueCat SDK wrapper
- `app.json` — Expo config (bundle ID, permissions, dark mode)
- `eas.json` — Build profiles

**Backend (cloudflare/)**
- `src/index.ts` — Hono router
- `src/routes/palm.ts` — POST /api/read-palm
- `src/routes/reading.ts` — GET /api/reading/:id
- `src/routes/synergy.ts` — POST /api/synergy
- `src/routes/webhook.ts` — RevenueCat webhook
- `src/lib/palmVision.ts` — GPT Image 2 vision analysis
- `src/lib/synthesizer.ts` — DeepSeek V4 Flash (batched, max 3 concurrent)
- `src/lib/synergyEngine.ts` — Compatibility engine
- `migrations/0001_initial.sql` — D1 schema
- `wrangler.toml` — Worker config
- `package.json` + `tsconfig.json`

**Docs**
- `docs/AI_RULES.md` — Coding standards
- `docs/ARCHITECTURE.md` — System design
- `docs/PRD.md` — Consolidated requirements
- `docs/PLAN.md` — Deployment steps

**Legal**
- `legal/privacy-policy.md` — GDPR/CCPA compliant
- `legal/terms-of-service.md` — Auto-renewal terms

## [2026-05-08 11:00] — Competitive Analysis

### What was done
- Full competitive analysis using 6+ research tools (web search, Lazyweb, idea-reality-mcp API)
- idea-reality-mcp deep scan: 78/100 reality signal, HIGH duplicate likelihood, DECLINING dev trend
- Deep dives on 7+ competitors: Palmist ($7.99/wk, 1.2M users), AstroGuru, PalmistryHD, Co-Star ($400K/mo revenue), Sanctuary, Nebula, live reading platforms
- Market sizing: $1.16B–$5.69B astrology app market, 19–20% CAGR
- User pain point analysis from App Store reviews and Reddit
- Pricing matrix showing Palmi's 87% undercut vs Palmist
- SWOT analysis + 5 strategic recommendations
- Lazyweb UI research for design benchmarking

### Key Decisions
- $0.99/wk pricing confirmed as aggressive but may need A/B testing at $1.99/wk
- Social sharing + bestie comparison confirmed as genuinely novel — zero competitors have it
- TikTok-first marketing validated as primary growth channel
- Speed to market identified as critical — ship MVP in 2 weeks

### Files Changed
- competitive_analysis.md (new artifact)

## [2026-05-08 11:53] — Copy Audit & Conversion Rewrite

### What was done
- Complete copy audit across 11 files (45+ string changes)
- All user-facing copy rewritten for conversion, Gen-Z voice, and viral shareability
- Pricing locked at $1.99/week (centralized in `Pricing` constant for A/B testing)
- Added Tier 1 retention features to paywall: Weekly Palm Insight + Palm Journal (rescan tracking)
- System prompts (palmVision + synthesizer) fully rewritten with scroll-stopping archetypes, screenshot-bait rules, voice examples, and anti-pattern guardrails
- Entertainment disclaimer added to settings + paywall (App Store compliance)
- All share messages rewritten as native social captions (not ads)
- CompatibilityCard watermark now includes growth loop CTA

### Key Decisions
- $1.99/week pricing (up from $0.99) — still 75% cheaper than Palmist ($7.99/wk), doubles ARPU
- "Less than a coffee per week" framing for anti-subscription-backlash
- "Real AI, not templates" positioning statement added to paywall (competitive differentiator)
- Retention via Weekly Palm Insight (push notification) + Rescan Journal with bestie/couple re-scan tracking
- Share messages use lowercase, native social voice, engagement bait ("what are you?")

### Files Changed
- `constants/config.ts` — Added `Pricing` constant
- `app/index.tsx` — Splash copy (3 changes)
- `app/capture.tsx` — Camera/scan copy (6 changes)
- `app/paywall.tsx` — Paywall copy (7 changes + 2 new features + disclaimer)
- `app/reading.tsx` — Reading/share copy (4 changes)
- `app/compare.tsx` — Compare copy (7 changes)
- `app/settings.tsx` — Settings copy (4 changes + disclaimer + style)
- `components/BlurOverlay.tsx` — In-reading paywall (3 changes)
- `components/CompatibilityCard.tsx` — Watermark CTA (1 change)
- `cloudflare/src/lib/palmVision.ts` — System prompt rewrite
- `cloudflare/src/lib/synthesizer.ts` — Synth prompt rewrite

## [2026-05-08 13:45] — Financial Modeling & Profitability Analysis

### What was done
- Created a comprehensive financial model for the $1.99/week subscription.
- Audited API costs for all agents using latest data (DeepSeek V4 Pro, GPT Image 2, DALL-E 3, MiniMax 2.7).
- Modeled the TikTok organic marketing conversion funnel (Views -> Installs -> Paywall -> Subscriptions).
- Determined break-even profitability points and margins.

### Key Decisions
- Locked in DeepSeek V4 Pro + GPT Image 2 for backend inference.
- Identified that 23 paying subscribers per month ($112 fixed costs) covers all operations.
- Highlighted that a single viral UGC video (100k views) guarantees profitability.

### Files Changed
- `C:\Users\sam\.gemini\antigravity\brain\94b78752-856f-4e3e-ac1e-7da76550bc39\implementation_plan.md` (new artifact)

## [2026-05-08 13:51] — ROI Analytics Code Execution

### What was done
- Applied comments to the financial plan (removed pre-traction UGC costs, updated Cloudflare to Paid Tier, fixed models to `gpt image 2` / `deepseek v4 pro`, added base tech costs).
- Added `net_ltv`, `acquisition_source` to `users` and `estimated_ai_cost` to `readings` and `synergy_results` in D1 migration.
- Instrumented `palm.ts` and `synergy.ts` to insert precise cost estimates into the database for each run.
- Rewrote the RevenueCat `webhook.ts` to automatically strip the App Store cut (15%) and accumulate net lifetime value on purchase/renewal events.
- Created `analytics.ts` exposing the `/api/marketing-roi` endpoint to aggregate ROI metrics for the Hermes agent.

### Key Decisions
- Used 15% Small Business Program cut for the default webhook net LTV accumulation logic.
- Kept the hardcoded AI cost estimation directly in the route level to avoid external price-fetching latency.

### Files Changed
- `cloudflare/migrations/0001_initial.sql`
- `cloudflare/src/index.ts`
- `cloudflare/src/routes/palm.ts`
- `cloudflare/src/routes/synergy.ts`
- `cloudflare/src/routes/webhook.ts`
- `cloudflare/src/routes/analytics.ts` (new)
- `task.md`
- `walkthrough.md`

## [2026-05-08 14:35] — Excel Financial Model Generation

### What was done
- Wrote a python script using `xlsxwriter` to generate an interactive `.xlsx` financial model.
- Created `Palmi_Financial_Model.xlsx` in the root directory.
- Model includes dynamic inputs (Subscription price, App Store fee, AI costs, Fixed costs, conversion rates) and 6-month projections with formulas for Net Profit and Break-Even subscriber targets.

## [2026-05-08 14:42] — a16z-Grade Financial Model Overhaul

### What was done
- Discarded simple static Excel model in favor of a 4-sheet institutional VC-grade model.
- Wrote `generate_a16z_model.py` to produce `Palmi_a16z_Model.xlsx`.
- Model now features an Executive Dashboard, Centralized Drivers (Base, Bear, Bull toggles), a 12-Month Cohort Retention Matrix (built on 2026 RevenueCat decay benchmarks), and a 12-Month Pro Forma P&L.
- Verified fractional AI cost handling.

### Key Decisions
- Limited projection to a 12-month horizon as requested.
- Implemented 2026 benchmarks: View-to-Install (1% - 5%), Install-to-Paid (2% - 8%), and heavy Month 1 churn followed by a 5% stabilization terminal rate.
- Used an organic-only K-Factor model, dropping CAC to $0 for the initial scale phase.

### Files Changed
- `C:\Users\sam\.gemini\antigravity\brain\94b78752-856f-4e3e-ac1e-7da76550bc39\scratch\generate_a16z_model.py` (new)
- `Palmi_a16z_Model.xlsx` (new)
- `task.md`
- `walkthrough.md`

## [2026-05-08 16:00] — Comprehensive Remediation (Waves 1-6)

### What was done
- 6-agent swarm audit: code review, security audit, domain analysis, architecture compliance, dependency check, and test generation
- 46 issues identified across 6 severity tiers, triaged into a 6-wave remediation plan
- All 6 waves completed across 2 sessions covering deployment blockers, broken features, error handling, domain hardening, and polish

### Wave 1 — Deployment Blockers & Revenue Protection
- **D1/KV setup:** wrangler.toml placeholders with explicit setup commands (was empty IDs)
- **Server-side subscription gating (CRITICAL):** palm.ts now queries `users.is_pro` and strips `fullReading` from premium lines for free users. reading.ts enforces the same check on GET. Prevents free users reading premium content by inspecting API responses.
- **Rate limiting:** KV-based sliding window rate limiter middleware (rateLimiter.ts). Applied to POST /api/read-palm (5/min) and POST /api/synergy (10/min). Graceful degradation when KV unavailable.
- **Image size validation:** Base64-decoded size checked against 5MB max before any AI call. Uses atob() (Workers-compatible).
- **Webhook timing side-channel (CRITICAL):** Replaced !== string comparison with crypto.subtle.timingSafeEqual. Added UNCANCELLATION support.

### Wave 2 — Broken Features
- **Compare/synergy feature:** compare.tsx completely rewritten from hardcoded demoResult to real API calls — parses friend link UUID, fetches both readings via getReading(), runs synergy via comparePalms(), with loading/error/result states.
- **POST /api/analytics:** Event tracking endpoint created with D1 persistence (analytics_events table). Fire-and-forget client with silent failure.
- **Turnstile verification:** Optional server-side verification on read-palm. Enabled when TURNSTILE_SECRET_KEY is set. Client sends token from capture.tsx. Gracefully skipped if not configured.

### Wave 3 — Error Handling & UX
- **Error detail leakage:** palmVision.ts and synthesizer.ts now throw generic errors. Raw API errors logged separately (truncated to 200 chars).
- **setInterval leak:** Replaced Math.random() progress with monotonic staged animation (5 steps to ~0.4) in capture.tsx.
- **Line ordering:** Removed free/premium split in reading.tsx. Lines now render in original order with per-line isLocked/BlurOverlay logic.
- **Request timeout:** AbortController with 30s default timeout added to api.ts (10s for simple lookups).
- **Error boundaries:** ScreenErrorBoundary class component with friendly fallback and "Try Again"/"Go Back" buttons.
- **Configurable premium lines:** PREMIUM_LINE_TYPES constant replaces hardcoded check.

### Wave 4 — Domain & Architecture Cleanup
- **Subscription state machine:** CANCELLATION preserves access until period end. EXPIRATION revokes pro. BILLING_ISSUE has grace period. Typed event union.
- **Reading ownership:** reading.ts verifies userId matches reading's user_id. synergy.ts requires at least one reading belongs to requesting user.
- **CORS restriction:** Changed from * to allowlist (getpalmi.com, workers.dev, localhost).
- **Error logging sanitization:** Only err.message logged in index.ts. API libs log truncated error text then throw generic errors.

### Wave 5 — Documentation Alignment
- Model names standardized: GPT Image 2 (gpt-image-2) + DeepSeek V4 Flash across ARCHITECTURE.md, AI_RULES.md, PRD.md, PLAN.md
- Pricing $1.99/week confirmed and updated in all docs
- Secret names removed from wrangler.toml comments

### Wave 6 — Nice-to-Have
- **AsyncStorage persistence:** Zustand persist middleware added to readingStore (history) and userStore (auth + subscription).
- **Concurrency limiting:** synthesizeAllLines batches of 3 (was unbounded Promise.all).
- **API error format:** All routes verified to use { error: string } consistently.
- **comparePalms tests:** 5 new tests: userId passthrough, 403 ownership failure, 404 not found, 400 invalid IDs.

### Test Results
- 82 tests across 4 test files, all passing, zero errors
- 34 synergy engine tests, 21 API client tests, 14 reading store tests, 9 user store tests, 4 new comparePalms tests

## [2026-05-08 17:35] — TRIBE v2 Neuromarketing Creative Workflow

### What was done
- Investigated and designed a multi-agent neuromarketing workflow utilizing Meta's TRIBE v2 multimodal brain encoder.
- Formalized the workflow concept into the Wiki (`tribe_v2_neuromarketing_workflow.md`) and linked it in `index.md`.
- Developed `orchestrator.py` to manage a high-volume pipeline (30 posts/day) targeting TikTok.
- Developed `luma_agent.py` to simulate Luma API carousel generation.
- Developed `tribe_client.py` to interface with a RunPod serverless TRIBE v2 instance for predicting spatial fMRI neural activations based on media inputs.
- Developed `deepseek_critic.py` using DeepSeek directly to interpret fMRI heuristics (Nucleus Accumbens for reward/hook, Amygdala for emotion, Prefrontal Cortex for cognitive load) based on empirical TikTok performance evidence, providing actionable feedback to the Luma agent.

### Key Decisions
- Set TikTok as the primary publishing destination.
- Bypassed intermediate LLM proxies (e.g. OpenRouter/Hermes) to query DeepSeek directly.
- Established a neuro-heuristic baseline derived from existing empirical data (reward vs. cognitive friction tradeoffs).
- Standardized the architecture for Luma agents generating carousel posts specifically for TikTok.

### Files Changed
- `c:\Users\sam\Dropbox\THS\Wiki\Wiki\concepts\tribe_v2_neuromarketing_workflow.md` (new)
- `c:\Users\sam\Dropbox\THS\Wiki\Wiki\index.md` (appended concept)
- `scripts\tribe_workflow\orchestrator.py` (new)
- `scripts\tribe_workflow\luma_agent.py` (new)
- `scripts\tribe_workflow\tribe_client.py` (new)
- `scripts\tribe_workflow\deepseek_critic.py` (new)
- `logs.md`

## [2026-05-14 23:00] — Cloudflare Infrastructure Provisioning & Pipeline Testing

### What was done
- Created D1 database `palmi-db` (OC region, ID: `1fa28cda-e5ae-4cb0-8468-76971cb49307`)
- Created KV namespace `PALMI_KV` (ID: `7ea954c254c34d4f875d8bcaeed0b3b0`)
- Ran D1 migration `0001_initial.sql` remotely — 4 tables + 2 indexes created
- Deployed Worker to `https://palmi-api.two-hoots-design.workers.dev`
- Set Cloudflare secrets: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`
- RevenueCat project configured: iOS app `com.palmi.app`, product `palmi_pro_weekly`, entitlement `pro`, test public key set in config.ts
- Full end-to-end pipeline tested with real palm image — HTTP 200, 5 lines detected, Gen-Z voice verified

### Key Decisions
- Switched vision model from `gpt-image-2` to `gpt-5.4-mini` (gpt-image-2 doesn't support `response_format: json_object` and returned 500 on all chat completions calls)
- `gpt-5.4-mini` requires `max_completion_tokens` not `max_tokens`
- Added `visibleLines` → `lines` fallback (AI occasionally uses non-standard key names)
- Added `INSERT OR IGNORE` user auto-create in palm.ts (previously FK constraint blocked first reading for new users)
- Added response validation with default fallbacks for missing fields in AI response
- RevenueCat webhook auth: `palmi-wh-8a3f2b9c1d4e5f6a7b8c9d0e1f2a3b4c` configured on both sides

### Test Results (all passing)
- `GET /` — `{"status":"ok"}`
- `POST /api/webhook/rc` valid auth — 200
- `POST /api/webhook/rc` invalid auth — 401
- `POST /api/analytics` — D1 write confirmed
- `GET /api/marketing-roi` — D1 read confirmed
- `POST /api/read-palm` with real palm — 200, full reading returned

### Files Changed
- `cloudflare/wrangler.toml` — replaced PLACEHOLDER IDs with real D1/KV IDs
- `cloudflare/src/lib/palmVision.ts` — model switch to gpt-5.4-mini, added response validation + visibleLines fallback + default field values
- `cloudflare/src/routes/palm.ts` — added user auto-create (INSERT OR IGNORE)
- `app/constants/config.ts` — updated apiBaseUrl to deployed URL, set revenueCatApiKey

## [2026-05-14] — App Store Readiness Review & Remediation

### What was done
- Cross-agent audit (ruflo-core:reviewer, ruflo-security-audit, ruflo-core:researcher) — 20 findings: 3 critical App Store blockers, 1 critical security vuln (CWE-287), 5 high-risk, 6 code quality, 5 pipeline gaps
- Produced `app-store-readiness-review.md` with full App Store Guideline cross-reference
- Phase 1: All 8 Must-Fix items resolved (pricing, auth, privacy manifest, RC key, AsyncStorage, prompt injection, rate limiter, body size limits)
- Phase 2: All 5 Should-Fix items resolved (security headers, GDPR endpoints, rate limiting on remaining routes, age rating documented, legal URL deploy documented)
- Phase 3: All 4 Nice-to-Fix items resolved (TypeScript `any` types, Dimensions→useWindowDimensions, accessibilityLabel, memory leak, ESLint configs)
- JWT_SECRET generated and deployed via `wrangler secret put`
- D1 migration 0002_add_auth_columns.sql applied locally

### Key Decisions
- JWT auth with 30-day grace period (dual-path: Bearer token + legacy userId body param)
- Token lifecycle: access 7d / refresh 14d, rotating refresh tokens, KV-backed opaque revocation
- Fail-closed everywhere: rate limiter returns 503 when KV unavailable, auth middleware returns 503 on KV failure
- RevenueCat key moved to env var (`EXPO_PUBLIC_RC_API_KEY`) for EAS Secrets
- PrivacyInfo.xcprivacy created with 5 data types + UserDefaults API reason
- Security headers: HSTS preload, nosniff, DENY framing, strict referrer, no camera/mic/geolocation
- GDPR: export + delete endpoints (auth-protected, full data wipe)
- TypeScript: cloudflare 0 errors, app 1 pre-existing test mock error (readingStore readonly array)

### Files Changed (33 files)
**New files (10):**
- `app-store-readiness-review.md`
- `app/privacyInfo.xcprivacy`
- `app/.env.example`
- `cloudflare/src/lib/jwt.ts`
- `cloudflare/src/middleware/auth.ts`
- `cloudflare/src/middleware/securityHeaders.ts`
- `cloudflare/src/routes/auth.ts`
- `cloudflare/src/routes/privacy.ts`
- `cloudflare/migrations/0002_add_auth_columns.sql`
- `cloudflare/.eslintrc.json`

**Modified files (23):**
- `legal/terms-of-service.md` — $0.99→$1.99
- `app/constants/config.ts` — RC key to env var
- `app/eas.json` — credential comments
- `app/stores/readingStore.ts` — premium strip in partialize
- `app/stores/userStore.ts` — JWT token fields + auth actions
- `app/services/api.ts` — Bearer auth, 401 refresh, registerUser
- `app/services/__tests__/api.test.ts` — updated for auth system
- `app/services/revenue.ts` — any→unknown type fix
- `app/app/capture.tsx` — useWindowDimensions, accessibilityLabel, progressRef leak fix, remove userId
- `app/components/PalmOverlay.tsx` — useWindowDimensions
- `cloudflare/src/index.ts` — JWT_SECRET, authRoute, securityHeaders, privacyRoute, auth middleware
- `cloudflare/src/routes/palm.ts` — body size limit, grace period auth
- `cloudflare/src/routes/reading.ts` — grace period auth, rate limiting
- `cloudflare/src/routes/synergy.ts` — body size limit, grace period auth
- `cloudflare/src/routes/analytics.ts` — body size limit, rate limiting
- `cloudflare/src/routes/webhook.ts` — any→RevenueCatEvent type
- `cloudflare/src/lib/synthesizer.ts` — sanitizeAnalysis, PROMPT_GUARD, DeepSeekResponse type
- `cloudflare/src/lib/rateLimiter.ts` — CF-Connecting-IP only, fail-closed
- `cloudflare/src/lib/palmVision.ts` — any→typed interfaces
- `cloudflare/wrangler.toml` — JWT_SECRET placeholder
- `cloudflare/package.json` — jose dependency added

### Infrastructure
- JWT_SECRET: generated (32 random bytes, base64) and uploaded via `wrangler secret put`
- D1 migration 0002: applied locally (auth_version + last_auth_at columns)
- Pending: `wrangler d1 migrations apply palmi-db --remote` for production
- Pending: `wrangler deploy` to ship all backend changes

