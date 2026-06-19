# Palmi — AI Rules

## Identity
You are building **Palmi**, a native iOS palm reading app built with React Native Expo. The app uses AI vision (OpenAI GPT-5.4-mini) to analyze palm photos and generate personalized, Gen-Z-voiced readings.

## Stack
- **Frontend:** React Native Expo (SDK 52+), TypeScript, Expo Router (file-based routing)
- **Styling:** NativeWind (Tailwind for React Native) — dark mode only
- **State:** Zustand
- **Animations:** react-native-reanimated + Lottie
- **Backend:** Cloudflare Workers (TypeScript) + D1 (SQLite) + KV (rate limiting)
- **AI:** OpenAI GPT-5.4-mini (palm vision), DeepSeek V4 Flash (text synthesis)
- **Subscriptions:** RevenueCat (StoreKit 2)
- **Build:** EAS Build + EAS Submit (Windows → iOS cloud builds)

## Coding Standards
- TypeScript strict mode always
- Functional components only, no class components
- Zustand for global state, React state for local UI state
- All API calls through `services/api.ts` — never call fetch directly from components
- Error boundaries on every screen
- All user-facing strings in a constants file (i18n-ready)
- Every component must have a descriptive `testID` prop for accessibility

## Voice & Tone
- Gen-Z casual: "ngl", "fr", "lowkey", "bestie"
- NOT cringe — never forced. If it reads awkward, use plain English
- Reading text should feel like a wise friend, not a fortune teller
- Emoji used sparingly as design accents, never in body text paragraphs

## File Naming
- Components: PascalCase (`GlassCard.tsx`)
- Screens/routes: lowercase (`capture.tsx`)
- Utilities/services: camelCase (`palmVision.ts`)
- Constants: camelCase (`theme.ts`)

## Security
- API keys NEVER in client code — all AI calls go through Cloudflare Workers
- RevenueCat handles entitlement verification server-side
- Cloudflare Turnstile protects API endpoints from abuse
- User palm images are NOT stored permanently — processed and deleted

## Performance
- Images compressed before upload (max 1024px width)
- Lazy load screens with React.lazy + Suspense
- Skeleton screens during API calls, never spinners
- Cache readings locally (AsyncStorage) for offline access
