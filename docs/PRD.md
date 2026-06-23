# Palmi — Product Requirements Document

## 1. Executive Summary
Palmi is an AI-powered palm reading app that uses computer vision to analyze palm lines and generate personalized, Gen-Z-voiced readings. The app's viral engine is a "bestie comparison" feature that drives organic sharing via TikTok/Reels content.

## 2. Target Audience
- **Primary:** Women 16-28, interested in astrology, spirituality, self-discovery
- **Secondary:** Couples and friend groups looking for fun compatibility content
- **Psychographic:** TikTok-native, screenshot-and-share culture, "which one are you" personality quiz enthusiasts

## 3. Core Features

### 3.1 Palm Scan (Free)
- Open camera with hand-position overlay guide
- AI scans palm using GPT-5.4-mini vision
- Dramatic neon-line tracing animation during scan
- Results revealed line-by-line with haptic feedback

### 3.2 Reading Results (Freemium)
**Free tier:**
- Heart Line analysis + archetype
- Head Line analysis + archetype
- Overall reading summary

**Pro tier ($1.99/week):**
- Life Line (deep locked behind paywall with visible blur)
- Future predictions
- Love insights
- Career insights
- Unlimited comparisons

### 3.3 Bestie Compare (Pro)
- "Challenge a Friend" deep link via iMessage/WhatsApp
- Both palms compared side-by-side
- Compatibility percentage with dramatic reveal
- Archetype matchup analysis
- Shareable compatibility card with watermark + QR code

### 3.4 Share System
- One-tap export of reading card as branded image
- Compatibility card with both palms + score
- "Share to TikTok" with pre-filled hashtags
- Every shared asset includes Palmi branding

### 3.5 Settings
- Restore Purchases button (Apple mandate)
- Privacy Policy link
- Terms of Service link
- Subscription management link (deep link to iOS Settings)
- Reading history / journal

## 4. Subscription Model

| Item | Value |
|---|---|
| Product ID | `palmi_pro_weekly` |
| Price | $1.99/week |
| Trial | 3-day free trial |
| Entitlement | `pro` |
| Provider | RevenueCat (StoreKit 2) |

### Paywall Trigger Points
1. After free Heart + Head line reading → "Unlock your Life Line"
2. On "Compare with Bestie" tap → "Pro members only"
3. On past reading access → "See your reading history"

## 5. Technical Requirements

### 5.1 AI Pipeline
1. **Palm Vision:** OpenAI GPT-5.4-mini (`gpt-5.4-mini`) — analyzes palm photo, returns structured JSON with line types, strengths, archetypes
2. **Text Synthesis:** DeepSeek V4 Flash (`deepseek-v4-flash`) — transforms raw analysis into Gen-Z voice readings
3. **Synergy Engine:** Comparison algorithm running on Cloudflare Workers — takes two readings, calculates compatibility

### 5.2 Backend (Cloudflare Workers)
- Hono router with typed routes
- D1 (SQLite) for user data, readings, synergy results
- KV for rate limiting and session tokens
- Turnstile for bot protection
- RevenueCat webhook handler for subscription events

### 5.3 Required Permissions
- Camera (NSCameraUsageDescription: "To scan and analyze your palm lines")
- Photo Library (optional — save reading cards)

## 6. Design Specifications

### 6.1 Color Palette
- Background: `#0A0A0F` (deep black)
- Primary accent: `#845EF7` (neon purple)
- Secondary accent: `#F7C948` (soft gold)
- Card surface: `rgba(255, 255, 255, 0.06)` with `backdrop-blur(40px)`
- Card border: `rgba(255, 255, 255, 0.08)`
- Text primary: `#FFFFFF`
- Text secondary: `rgba(255, 255, 255, 0.6)`

### 6.2 Typography
- UI: Space Grotesk (Variable, 400-700)
- Readings: DM Serif Display (400)
- Reading labels: Space Grotesk 600

### 6.3 Key Interactions
- Palm scan: neon line tracing animation + haptic pulse on complete
- Reading reveal: line-by-line spring animation (staggered 300ms)
- Compatibility reveal: countdown → haptic burst → score fly-in
- Paywall: glass card slide-up with parallax blur

## 7. App Store Metadata

### 7.1 App Name
**Palmi — AI Palm Reading**

### 7.2 Subtitle
*Your palm tells a story*

### 7.3 Keywords
palm reading, palmistry, astrology, compatibility, personality, AI, hand analysis, love line, zodiac, fortune

### 7.4 Category
Entertainment (Primary), Lifestyle (Secondary)

## 8. Success Metrics
- **Week 1:** Working build on TestFlight
- **Week 2:** App Store submission
- **Month 1:** 1,000 downloads via organic TikTok
- **Month 3:** 10K MRR ($1.99/week × ~1,250 active subscribers)
