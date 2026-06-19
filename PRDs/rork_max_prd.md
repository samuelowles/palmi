# Product Requirements Document (PRD): Rork Max iOS App

## 1. Executive Summary
This PRD defines the requirements for building the "Vibe Code" Palm Reading iOS application using the Rork Max cloud-based development environment. The app must deliver a premium, Gen-Z focused aesthetic while seamlessly integrating camera functionality, API calls to the Backend AI engine, and native iOS subscriptions (via RevenueCat/StoreKit).

## 2. Target Audience & Aesthetic
- **Audience:** Gen-Z and Millennials interested in astrology, spirituality, and "vibe checks."
- **Aesthetic:** Dark mode, neon accents, glassmorphism UI elements, and fluid animations. The design must feel intuitive, native, and premium, contrasting with traditional "clunky" astrology apps.

## 3. Core User Flows

### 3.1 Onboarding & Palm Capture
1. User downloads and opens the app.
2. Short, animated splash screen.
3. Prompt requesting Camera Permissions with a clear "Why we need this" (to read your palm).
4. **Camera UI:** An overlay guide (outline of a hand) helps the user align their palm correctly.
5. Capture button triggers a high-resolution photo.
6. A "Scanning..." animation plays while the image is sent to the Backend AI via API.

### 3.2 The Free Reading (Top of Funnel)
1. Upon successful AI analysis, the user is presented with the **first half** of their reading.
2. Content should be highly relatable, focusing on surface-level traits (e.g., "Your life line shows you are highly empathetic but easily drained").
3. As the user scrolls to read deeper insights (e.g., Love, Career, Future), the text fades out under a blur effect.

### 3.3 The Paywall (Monetization)
1. **Trigger:** User attempts to read the blurred text OR clicks the "Compare with Bestie" tab.
2. **UI:** A high-converting paywall screen slides up.
3. **Offer:** $2.99/month for "Full Premium Access".
   - Unlocks full palm readings.
   - Unlocks unlimited "Compare with Bestie" synergy scores.
4. **Action:** Integrate Apple StoreKit / RevenueCat for frictionless 1-tap subscription.

### 3.4 Viral Mechanics: "Compare with Bestie"
1. **Prerequisite:** User must be a Premium subscriber.
2. User invites a friend (via native iOS share sheet) to download the app and scan their palm.
3. Once both palms are scanned, the app triggers a "Synergy Analysis" endpoint.
4. Generates a highly visual, aesthetic "Compatibility Card" (e.g., "98% Match - Twin Flames") designed explicitly for sharing on TikTok/Instagram Stories.

## 4. Technical Requirements for Rork Max
- **Platform:** iOS Native.
- **Permissions:** Camera (AVFoundation).
- **Network:** REST/GraphQL API integration to communicate with the Backend API (hosted on **Cloudflare Workers**). Because Cloudflare Turnstile does not have a native iOS SDK, the free reading endpoint must be protected by embedding Turnstile within a `WKWebView` component to generate the challenge token before the native API call.
- **Monetization:** StoreKit / RevenueCat SDK integration for managing auto-renewable subscriptions ($2.99/mo).
- **Analytics:** The app will send analytics events (`app_open`, `camera_capture`, `paywall_view`, `subscription_success`, `share_card`) via standard HTTP POST requests directly to the Cloudflare Zaraz API/Worker, bypassing the need for heavy native SDKs.

## 5. Definition of Done
- App builds successfully in the Rork Max browser environment.
- Camera captures a clear image and successfully transmits it to a mock API endpoint.
- Paywall correctly triggers the native iOS subscription flow.
- UI perfectly matches the Figma/v0 mockups.
