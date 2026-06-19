# Product Requirements Document (PRD): Subscription & Payment Automation

## 1. Executive Summary
This PRD outlines the requirements for automating the monetization layer of the app. The core revenue driver is a **$2.99/month** auto-renewing subscription that unlocks the second half of the palm reading and the viral "Compare with Bestie" feature.

## 2. Platform & Tooling
- **Primary Platform:** Apple App Store (In-App Purchases).
- **Backend Provider:** RevenueCat (highly recommended for eliminating manual receipt validation logic and providing real-time webhook events).

## 3. The Paywall Experience
- **Placement:** Triggered exactly at the point of highest curiosity (e.g., when the user attempts to scroll down to read the "Future & Fate" section of their reading, or clicks the "Compare" button).
- **UI Requirements:**
  - "Unlock Your Full Destiny"
  - Clear pricing: "$2.99 / Month"
  - Large, pulsating CTA button: "Start Premium"
  - Mandatory legal text (Terms of Service, Privacy Policy, Auto-renewal terms) to pass App Store review.

## 4. Automation & Data Flow
1. User taps "Start Premium" -> Triggers native Apple FaceID/TouchID prompt.
2. Apple confirms payment -> RevenueCat SDK instantly updates the user's entitlement state.
3. App UI reacts immediately, unlocking the blurred text and the compatibility engine.
4. RevenueCat sends a Webhook to the Analytics Pipeline (see Analytics PRD) logging the successful `trial_started` or `subscription_purchased` event.

## 5. Churn Mitigation
- If a user cancels their subscription (detected via RevenueCat webhook), the app will present a one-time "Downsell" offer upon their next app open (e.g., "Keep access for $0.99/month").

## 6. Definition of Done
- App Store Connect products are configured.
- RevenueCat successfully manages the transaction in the sandbox environment.
- The app instantly unlocks premium features upon sandbox purchase without requiring an app restart.
