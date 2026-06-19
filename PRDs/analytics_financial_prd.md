# Product Requirements Document (PRD): Analytics & Financial Flywheel

## 1. Executive Summary
This PRD defines the data pipeline required to track user behavior from TikTok view to paying subscriber. This telemetry is critical for the Hermes agent to evaluate which UGC creatives are profitable and to adjust marketing spend autonomously.

## 2. Funnel Tracking (Event Taxonomy)
*Note: Because Cloudflare Zaraz does not offer a native iOS SDK, the iOS app will send event payloads via HTTP POST to a Cloudflare Worker.* This Worker will securely proxy the events to Zaraz for server-side tag management (routing to Mixpanel/PostHog/TikTok Pixel) without bloating the iOS app bundle.
Track the following events:
- `app_installed`
- `onboarding_started`
- `palm_scanned`
- `free_reading_viewed`
- `paywall_presented`
- `subscription_purchased` (Value: $2.99)
- `friend_compatibility_scanned`
- `compatibility_card_shared`

## 3. The Financial Flywheel API
- **Objective:** Expose real-time ROI metrics to the Hermes Agent.
- **Process:**
  1. The analytics backend (powered by **Cloudflare Workers** and **Cloudflare D1**) groups subscriptions by acquisition cohort (e.g., "Users from UGC Video A").
  2. Calculates the Customer Acquisition Cost (CAC) vs. Lifetime Value (LTV). (At a $2.99/mo price point, initial LTV estimates should be conservative).
  3. Exposes an API endpoint: `GET /api/marketing-roi` (protected by Cloudflare Zero Trust/WAF).
  4. The Hermes agent calls this API daily. If a specific UGC creative is generating subscriptions at a profitable CAC, the Hermes agent automatically increases the ad budget for that specific asset in the Meta/TikTok Ads manager.

## 4. Definition of Done
- All funnel events are firing correctly in the production environment.
- The API endpoint successfully returns aggregated conversion data for the Hermes agent to parse.
