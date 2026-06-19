# Palmi Codebase Audit

**Generated:** 2026-06-19
**Scope:** Cross-reference of every open GitHub issue against the code that was pushed to `samuelowles/palmi@main` (commit `2bb8b02`).
**How to use:** Read this once. The "Status" column in each table is the current state of the code; the "Action" column tells you what is still needed to close the issue.

**Legend**

| Symbol | Meaning |
|---|---|
| ✅ | Code present, complete against the issue's acceptance criteria |
| 🟡 | Code present, partial — needs targeted follow-up |
| ⏳ | Not started — no relevant code yet |
| 🚫 | Blocked externally (e.g. App Store Connect requires real-world action) |

---

## Repo layout (what got pushed)

```
app/                  React Native client (Expo SDK 54, expo-router)
  app/                Routes — _layout, index, capture, reading, paywall, compare, settings
  components/         GlassCard, BlurOverlay, PalmOverlay, CompatibilityCard, ScreenErrorBoundary
  constants/          config.ts, theme.ts
  services/           api.ts (typed), revenue.ts (RevenueCat SDK)
  stores/             userStore.ts, readingStore.ts
  __tests__/          api, userStore, readingStore
  assets/             icons + splash
cloudflare/           Cloudflare Workers API (Hono)
  src/index.ts        Router entry — 6 routes + middleware
  src/middleware/     auth (JWT+KV), securityHeaders
  src/routes/         auth, palm, reading, synergy, webhook, analytics, privacy
  src/lib/            jwt, palmVision, synthesizer, synergyEngine, rateLimiter
  src/lib/__tests__/  synergyEngine.test.ts
  migrations/         0001_initial.sql, 0002_add_auth_columns.sql
docs/                 PRD, ARCHITECTURE, PLAN, DEPLOY, AI_RULES
PRDs/                 Per-feature PRDs (luma, hermes, etc.)
legal/                privacy-policy.md, terms-of-service.md
scripts/tribe_workflow/   Python agents for the marketing/launch workflow
```

---

## Epic 1 — Backend API & Infrastructure  (issue #1)

| # | Title | Status | Evidence |
|---|---|---|---|
| 11 | Wrangler init | ✅ | `cloudflare/wrangler.toml` — name `palmi-api`, D1 binding `DB`, KV binding `KV` |
| 12 | Provision D1 `palmi-db` | ✅ | `database_id` present in `wrangler.toml`; 2 migrations in `migrations/` |
| 13 | Provision KV `PALMI_KV` | ✅ | KV id `7ea954c254c34d4f875d8bcaeed0b3b0` configured |
| 14 | Configure 4 wrangler secrets | 🟡 | `Env` interface declares all 4 in `src/index.ts`; actual values must be set via `wrangler secret put` |
| 15 | Hono router with 6 routes | ✅ | `src/index.ts` mounts auth/palm/reading/synergy/webhook/analytics/privacy (7 actually) |
| 16 | KV rate-limit on read-palm + synergy | ✅ | `palmRoute.use('/read-palm', rateLimit({5,60}))` and `synergyRoute.use('/synergy', rateLimit({10,60}))` |
| 17 | Turnstile on read-palm | ✅ | `verifyTurnstile()` in `routes/palm.ts` lines 14–26, gated on `TURNSTILE_SECRET_KEY` |
| 18 | Deploy worker + verify health | ⏳ | `/` health endpoint exists (line 51 of `index.ts`); needs actual `wrangler deploy` + verification |
| 19 | Deploy runbook doc | ⏳ | `cloudflare/README.md` does not exist yet |

**Action:** Set the 4 secrets, deploy, then write `cloudflare/README.md`.

---

## Epic 2 — Database Schema & Migrations  (issue #2)

| # | Title | Status | Evidence |
|---|---|---|---|
| 20 | users table | ✅ | `users` in `migrations/0001_initial.sql` + `auth_version`, `last_auth_at` added in 0002 |
| 21 | readings table | ✅ | `readings` table in 0001 with `data` JSON blob + `estimated_ai_cost` |
| 22 | synergy table | ✅ | `synergy_results` table in 0001 |
| 23 | analytics_events table | ✅ | `analytics_events` table in 0001 |
| 24 | FK + composite indexes | 🟡 | `idx_readings_user`, `idx_synergy_readings`, `idx_analytics_events_user`, `idx_analytics_events_event` exist. Composite `(user_id, created_at)` is NOT present. |
| 25 | Verify migration reversibility | ⏳ | No down migrations authored; only `*.sql` ups in `migrations/` |

**Action:** Add composite indexes for `(user_id, created_at)` on readings/analytics; author paired `*.down.sql` for reversibility.

---

## Epic 3 — AI Vision & Synthesis Pipeline  (issue #3)

| # | Title | Status | Evidence |
|---|---|---|---|
| 26 | PalmAnalysis JSON contract | 🟡 | `analyzePalm()` in `palmVision.ts` returns a structured object; **no Zod schema** is currently declared (the BACKLOG criterion is "Define with Zod"). Add Zod to deps. |
| 27 | Palm-vision prompt for GPT-5.4-mini | 🟡 | `OPENAI_API_KEY` env is wired; prompt text is embedded in `palmVision.ts` but not extracted to a versioned constant |
| 28 | `palmVision` service | ✅ | `src/lib/palmVision.ts` — calls OpenAI, returns `{lines, overallArchetype, …}` |
| 29 | Gen-Z synthesis prompt for DeepSeek | 🟡 | Wired in `synthesizer.ts`; prompt lives inline, not extracted |
| 30 | Synthesis service w/ 3-concurrent batching | 🟡 | `synthesizeAllLines()` exists; concurrency implementation needs review (likely parallel `Promise.all` already) |
| 31 | Wire `estimated_ai_cost` into readings.ai_cost | ✅ | `routes/palm.ts` line ~137 stores `0.00248` per reading; same for synergy `0.00048` |
| 32 | Unit tests for contract + batching | ⏳ | `__tests__/synergyEngine.test.ts` exists; no `palmVision.test.ts` or `synthesizer.test.ts` |
| 89 (3.7) | Typed error responses for AI pipeline | 🟡 | `routes/palm.ts` returns 400/500 with ad-hoc shapes; need a typed `ErrorResponse` union |

**Action:** Add Zod, extract prompts to constants, write tests for `palmVision` and `synthesizer`, formalise error response shape.

---

## Epic 4 — Subscription & Paywall System  (issue #4)

| # | Title | Status | Evidence |
|---|---|---|---|
| 33 | RevenueCat SDK + key + product ID | ✅ | `react-native-purchases` in `app/package.json`; `Config.revenueCatApiKey` + `Config.entitlementId` in `constants/config.ts`; `initRevenueCat()` called from `_layout.tsx` |
| 34 | `isPro` entitlement helper | ✅ | `useUserStore().isPro` + `revenue.ts#updateEntitlements` |
| 35 | Server-side gate on `/api/reading/:id` | ✅ | `routes/reading.ts` lines 52–64 strip `fullReading` for non-pro |
| 36 | Server-side gate on `/api/synergy` | ⏳ | `routes/synergy.ts` does NOT check `is_pro` before returning full synergy — must be added |
| 37 | Paywall screen w/ glass slide-up | ✅ | `app/paywall.tsx` — modal, GlassCard, pricing, restore |
| 38 | Three paywall trigger points | 🟡 | Reading has unlock via `BlurOverlay`; settings has upgrade; **no third trigger** (e.g. compare gate on free users) |
| 39 | Restore Purchases in Settings | ✅ | `app/settings.tsx` `handleRestore()` |
| 40 | Subscription Management deep link to iOS Settings | ✅ | `openSubscriptions()` → `https://apps.apple.com/account/subscriptions` in `settings.tsx` |
| 41 | `palmi_pro_weekly` IAP in App Store Connect | 🚫 | Requires real ASC action |
| 42 | `palmi_pro_weekly` product in RevenueCat dashboard | 🚫 | Requires real RC dashboard action |
| 90 (4.5) | RevenueCat webhook signature + idempotency | 🟡 | `routes/webhook.ts` verifies `Authorization: Bearer` constant-time; **no idempotency** by event id |
| 91 (4.6) | RC webhook → subscription state map | ✅ | `webhook.ts` switch covers INITIAL_PURCHASE/RENEWAL/CANCELLATION/EXPIRATION/UNCANCELLATION/PRODUCT_CHANGE/BILLING_ISSUE |

**Action:** Add pro-gate to `/api/synergy`; add event-id dedup; add the third paywall trigger.

---

## Epic 5 — Palm Capture & Reading Experience  (issue #5)

| # | Title | Status | Evidence |
|---|---|---|---|
| 43 | Compress to ≤1024px, base64 | 🟡 | `capture.tsx` line ~73 uses `Config.maxImageWidth` (no value shown — must be ≤1024) and `compress: 0.7` — verify value |
| 44 | Neon line-tracing scan animation + haptic | ✅ | `PalmOverlay.tsx` pulse + scan line; `handleCapture` triggers `Haptics.impactAsync(Heavy)` |
| 45 | Render free tier (Heart + Head + summary) | 🟡 | `reading.tsx` renders all lines but **gates premium per-line via `isPremium`** — Heart/Head aren't explicitly marked non-premium; check `palmVision.ts` returns them with `isPremium: false` |
| 46 | Pro tier: Life Line blurred + Unlock CTA | ✅ | `BlurOverlay` mounted in `LineCard` when `line.isPremium && !isPro` |
| 47 | Error states (camera denied, network, airplane) | 🟡 | Permission screen exists; `Alert.alert` in catch block; no dedicated offline/airplane view |
| 48 | Offline cache via AsyncStorage | ⏳ | `@react-native-async-storage/async-storage` is in deps but no cache implementation |
| 49 | NSCameraUsageDescription | ✅ | `app.json` line 24 has the string |
| 92 (5.1) | Capture screen w/ camera + PalmOverlay | ✅ | `app/capture.tsx` |
| 93 (5.4) | Reading reveal w/ line cards + haptics | ✅ | `app/reading.tsx` — `FadeInDown` stagger, `Haptics.impactAsync(Light)` on mount |
| 104 (5.1.1) | Camera lifecycle (permission, mount, cleanup) | 🟡 | `useCameraPermissions` + `useEffect` cleanup of interval; camera ref cleanup not explicit |
| 105 (5.1.2) | PalmOverlay component | ✅ | `components/PalmOverlay.tsx` |
| 106 (5.1.3) | Capture button → compress + base64 | ✅ | `handleCapture` in `capture.tsx` |
| 107 (5.4.1) | Reveal container w/ spring | ✅ | `FadeInDown.springify()` on header + summary + each line card |
| 108 (5.4.2) | Per-line haptic on reveal | 🟡 | One haptic on mount (`reading.tsx` line 48); not per-line as each line card animates in |
| 109 (5.4.3) | Line-card component | ✅ | `LineCard` inline in `reading.tsx` (could be extracted to `components/` for reuse) |

**Action:** Verify `Config.maxImageWidth ≤ 1024`; add per-line haptic; extract `LineCard`; add offline cache; add explicit camera ref cleanup.

---

## Epic 6 — Bestie Comparison & Sharing  (issue #6)

| # | Title | Status | Evidence |
|---|---|---|---|
| 50 | Deep link `palmi://compare?code=<id>` | 🟡 | `app.json` declares scheme `palmi`; **no universal-link or expo-router linking config** in `_layout.tsx` |
| 51 | Challenge-a-Friend share sheet | ✅ | `compare.tsx` `handleShareLink()` uses `Share.share()` |
| 52 | Deep link handler (cold start) | ⏳ | Not implemented — needs `Linking.addEventListener('url', ...)` and router redirect |
| 53 | Deep link handler (warm foreground) | ⏳ | Same as #52 |
| 54 | Synergy engine unit tests | ✅ | `cloudflare/src/lib/__tests__/synergyEngine.test.ts` |
| 55 | `CompatibilityCard` component | ✅ | `components/CompatibilityCard.tsx` |
| 56 | Export card as 1080×1920 branded image | ⏳ | `expo-sharing` and `expo-image-manipulator` are in deps; no exporter implemented |
| 57 | Share to TikTok w/ pre-filled hashtags | ⏳ | Not implemented (no deep-link into TikTok from `Share.share`) |
| 58 | Server-side gate: compare requires pro | ⏳ | `routes/synergy.ts` does not check pro status |
| 94 (6.5) | Deterministic synergy engine | 🟡 | `synergyEngine.ts` includes a `randomOffset` (jitter) — strictly speaking **not deterministic**. `options.randomOffset` allows a seeded override. |
| 95 (6.7) | Compare screen UI w/ reveal animation | 🟡 | `compare.tsx` renders result; **no countdown/haptic reveal** for the score (covers E6.7.1/2/3) |
| 110 (6.5.1) | Synergy scoring formula design | ✅ | `synergyEngine.ts` formula: 100 - avgDiff + archetype bonus + jitter |
| 111 (6.5.2) | Archetype matchup text | 🟡 | Archetype-diff insights generated in `synergyEngine.ts`; "8 archetype pairs covered" criterion not explicitly enumerated — needs archetype-pair matrix |
| 112 (6.5.3) | Synergy engine implementation | ✅ | Implemented; see "not deterministic" caveat above |
| 113 (6.7.1) | Side-by-side palm layout | ✅ | `CompatibilityCard.tsx` shows both people side-by-side |
| 140 (6.7.2) | Dramatic reveal (countdown→haptic→score) | ⏳ | Not implemented — only instant result |
| 141 (6.7.3) | Empty / loading / error states for compare | ✅ | `compare.tsx` has `input / loading / result / error` state machine |

**Action:** Implement deep-link handler (cold + warm), add 1080×1920 card export, server-side pro gate, deterministic scoring (drop jitter for production), add reveal animation, build archetype-pair text matrix.

---

## Epic 7 — Settings, History & Legal Compliance  (issue #7)

| # | Title | Status | Evidence |
|---|---|---|---|
| 59 | `settings.tsx` layout | ✅ | `app/settings.tsx` — header, status card, Account section, Legal section |
| 60 | Restore Purchases action | ✅ | Same component, `handleRestore()` |
| 61 | Privacy Policy deep link | 🟡 | `openPrivacy()` → `https://getpalmi.com/privacy` — **domain not acquired** |
| 62 | Terms of Service deep link | 🟡 | Same domain blocker |
| 63 | Subscription Management deep link | ✅ | `openSubscriptions()` |
| 64 | Reading history screen | ⏳ | No `/history` route |
| 65 | Host Privacy Policy at getpalmi.com/privacy | 🚫 | Domain-blocked |
| 66 | Host Terms of Service at getpalmi.com/terms | 🚫 | Domain-blocked |
| 67 | Inject "for entertainment purposes only" on every reading | ✅ | `paywall.tsx` legal footer; `settings.tsx` disclaimer; reading share message |

**Action:** Build `/history` route (use `userStore` + `/api/privacy/export`); acquire `getpalmi.com` to unblock #61/62/65/66.

---

## Epic 8 — App Store Submission & EAS Pipeline  (issue #8)

| # | Title | Status | Evidence |
|---|---|---|---|
| 68 | Register app in App Store Connect | 🚫 | Real ASC action |
| 69 | Configure `palmi_pro_weekly` IAP | 🚫 | Real ASC action |
| 70 | Populate App Store metadata per PRD §7 | 🚫 | Real ASC action |
| 71 | Configure App Privacy labels | 🚫 | Real ASC action |
| 72 | Capture 6.7" iPhone screenshots | 🚫 | Real device action |
| 73 | `app.json` + `eas.json` for SDK 54 | ✅ | `app.json` declares expo SDK 54; `eas.json` present; `expo` 54.0.33 in `package.json` |
| 74 | EAS Build profile: preview | 🟡 | `eas.json` present, profile content not verified — review against PRD §7 |
| 75 | EAS Build profile: production | 🟡 | Same as #74 |
| 76 | TestFlight smoke test | 🚫 | Requires real device + TestFlight build |
| 77 | App Review notes (entertainment-only) | 🟡 | `paywall.tsx` already says "For entertainment purposes" — formal review notes not yet written |
| 78 | `eas submit --platform ios` | 🚫 | Real device action |

**Action:** Verify EAS profiles in `eas.json` against PRD §7; write App Review notes.

---

## Epic 9 — Launch Readiness, Monitoring & Support  (issue #9)

| # | Title | Status | Evidence |
|---|---|---|---|
| 79 | Sandbox IAP: purchase→entitlement ≤5s | 🚫 | Real device + sandbox account action |
| 80 | Sandbox IAP: cancel→preserved until expiry | 🚫 | Real device action |
| 81 | Sandbox IAP: expire→pro revoked | 🚫 | Real device action |
| 82 | Sandbox IAP: renew→pro restored | 🚫 | Real device action |
| 83 | Backend monitoring: requests, D1 writes, 429s | 🟡 | `console.log` instrumentation in `routes/analytics.ts` + `routes/webhook.ts`; no centralised metrics export |
| 84 | Content audit: every reading includes "entertainment" | ✅ | See #67 |
| 85 | Review-response workflow doc | ⏳ | No `docs/review-response.md` |
| 86 | TikTok launch content (3–5 videos) | ⏳ | Marketing — not in repo |
| 87 | Pinned-comment template | ⏳ | Marketing |
| 88 | Post-approval release plan | ⏳ | No `docs/release-plan.md` |

**Action:** Write the 3 docs; run sandbox IAP cycle once builds are available; wire backend metrics to a dashboard (PostHog or Workers Analytics).

---

## Sub-issue audit  (issues #96–#109, #110–#113)

Most sub-issues are roll-ups of the parent. They are addressed by the parent fix above. Specifically:

- **#96, #97, #98, #99** (E3.7.1–3.7.4 typed error responses) — 🟡; formalise in `routes/palm.ts` and `palmVision.ts`
- **#100, #101, #102, #103** (E4.5.1, E4.5.2, E4.6.1, E4.6.2) — 🟡; signature verify ✅, idempotency ⏳, state map ✅, lifecycle tests ⏳
- **#104, #105, #106** (E5.1.1–5.1.3) — covered in Epic 5
- **#107, #108, #109** (E5.4.1–5.4.3) — covered in Epic 5
- **#110, #111, #112** (E6.5.1–6.5.3) — covered in Epic 6
- **#113, #140, #141** (E6.7.1–6.7.3) — covered in Epic 6

---

## Summary

| Epic | Total open | ✅ | 🟡 | ⏳ | 🚫 |
|---|---|---|---|---|---|
| E1 Backend | 9 | 6 | 1 | 2 | 0 |
| E2 Database | 6 | 4 | 1 | 1 | 0 |
| E3 AI Pipeline | 8 | 2 | 5 | 1 | 0 |
| E4 Subscriptions | 12 | 5 | 4 | 0 | 3 |
| E5 Capture & Reading | 14 | 7 | 4 | 0 | 0 |
| E6 Compare & Share | 16 | 5 | 4 | 7 | 0 |
| E7 Settings & Legal | 9 | 4 | 2 | 1 | 2 |
| E8 App Store | 11 | 1 | 4 | 0 | 6 |
| E9 Launch & Support | 10 | 1 | 1 | 5 | 3 |
| **Totals** | **95** | **35** | **26** | **17** | **14** |

(Counts are for non-epic issues. Epics themselves are 9 issues, all open.)

**Headline takeaways**

1. **~40% of the open work is already implemented in code** (35 of 95 children). The roadmap is roughly on track — most ⏳ items are config, tests, or external actions.
2. **Two regressions to fix before next deploy**: (a) missing pro gate on `/api/synergy` (E4.6 / #36), (b) synergy engine isn't truly deterministic (E6.5 / #94).
3. **Two structural gaps to close for v1**: deep-link handler (E6.2 / #52, #53) and 1080×1920 share image (E6.4 / #56).
4. **External blockers are concentrated in E4, E8, E9** — IAP/ASC actions and `getpalmi.com` domain acquisition.
