# Palmi — Architecture

## System Overview

```
┌─────────────────────────────────────────────┐
│              iOS App (Expo)                  │
│                                             │
│  Expo Router (file-based)                   │
│  ├── index.tsx      → Splash/Onboarding     │
│  ├── capture.tsx    → Camera + Palm Overlay  │
│  ├── reading.tsx    → Reading Results        │
│  ├── paywall.tsx    → RevenueCat Paywall     │
│  ├── compare.tsx    → Bestie Comparison      │
│  └── settings.tsx   → Settings + Legal       │
│                                             │
│  Services Layer                              │
│  ├── api.ts         → CF Workers client      │
│  ├── revenue.ts     → RevenueCat SDK         │
│  └── analytics.ts   → Event tracking         │
│                                             │
│  State (Zustand)                             │
│  ├── readingStore   → Palm readings          │
│  └── userStore      → Auth + subscription    │
└──────────────┬──────────────────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────────────────┐
│          Cloudflare Workers                  │
│                                             │
│  Routes                                      │
│  ├── POST /api/read-palm     → palmVision   │
│  ├── GET  /api/reading/:id   → D1 lookup    │
│  ├── POST /api/synergy       → synergyEngine│
│  ├── POST /api/analytics     → event ingest │
│  └── POST /api/webhook/rc    → RevenueCat   │
│                                             │
│  External APIs                               │
│  ├── OpenAI GPT-5.4-mini (vision + gen)      │
│  ├── DeepSeek V4 Flash (text synthesis)     │
│  └── RevenueCat (entitlement check)         │
│                                             │
│  Storage                                     │
│  ├── D1 (SQLite) → users, readings, synergy │
│  └── KV → session tokens, rate limits       │
└─────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│           RevenueCat                         │
│  ├── Product: palmi_pro_weekly ($1.99/wk)   │
│  ├── Entitlement: "pro"                     │
│  └── Webhook → CF Worker /api/webhook/rc    │
└─────────────────────────────────────────────┘
```

## Data Flow: Palm Reading

1. User captures palm photo via `expo-camera`
2. Image compressed to max 1024px, converted to base64
3. `POST /api/read-palm` with base64 image + Turnstile token
4. CF Worker validates Turnstile, rate limits, checks image size, forwards to OpenAI GPT-5.4-mini (gpt-5.4-mini)
5. GPT-5.4-mini returns structured JSON: line analysis, archetypes, scores
6. CF Worker passes to DeepSeek V4 Flash for Gen-Z voice synthesis
7. Combined result stored in D1, response sent to app
8. App displays free lines (Heart + Head) immediately
9. Life Line + deep insights behind RevenueCat paywall

## Data Flow: Bestie Comparison

1. User A shares deep link via "Challenge a Friend"
2. User B opens link → app install or deep link handler
3. Both users' readings fetched from D1
4. Synergy engine calculates compatibility score + archetype match
5. Compatibility card generated (both palms, score, archetypes)
6. Card rendered as shareable image with Palmi watermark + QR code

## Key Directories

```
Palm Reader/
├── docs/           # Project docs (this file, AI_RULES, PRD, PLAN)
├── app/            # React Native Expo app (source code)
│   ├── app/        # Expo Router screens
│   ├── components/ # Shared UI components
│   ├── services/   # API clients
│   ├── stores/     # Zustand state
│   ├── constants/  # Theme, config, strings
│   └── assets/     # Fonts, images, Lottie
├── cloudflare/     # Backend workers
│   ├── src/        # Worker source
│   └── migrations/ # D1 schema
├── legal/          # Privacy policy, ToS
├── logs.md         # Session activity log
└── bugs.md         # Issue tracker
```
