# Product Requirements Document (PRD): Hermes Agent (Operations Orchestrator)

## 1. Executive Summary
This PRD defines the requirements for the "Hermes Agent," an autonomous orchestrator built on the **Nous Research Hermes Agent framework** and powered by the **MiniMax 2.7 HighSpeed** model. This agent acts as the primary marketing operator, handling organic distribution, engagement hacking, and UGC creator management.

## 2. Core Capabilities

### 2.1 Content Distribution (TikTok)
- **Input:** Zipped payload of slideshow assets and metadata from the Luma Agent.
- **Process:**
  - Authenticates into the primary TikTok account (via API or Playwright automation).
  - Uploads the image carousel.
  - Inserts the generated caption, hashtags, and selects a trending audio track.
  - Ensures the "Link in Bio" is active and correctly formatted.
- **Frequency:** 3-5 times daily.

### 2.2 Engagement Hacking
- **Objective:** Artificially boost credibility and direct traffic to the app.
- **Process:**
  - Maintains a pool of 5-10 "burner" TikTok accounts.
  - Monitors the primary account's posts.
  - Within 10 minutes of a post going live, switches to a burner account and posts a comment: 
    - *"omg wait this palm reading app was the best one I found that does it for free"* or *"ngl the compatibility feature exposed my ex 💀"*
  - The primary account immediately "pins" this comment.

### 2.3 UGC Sourcing & Management
- **Objective:** Autonomously source high-converting User Generated Content for paid ad spend.
- **Platform Selection:** Dynamically selects the optimal UGC platform at runtime (e.g., Billo, Insense, or direct TikTok Creator Marketplace outreach) based on pricing ($10/video budget) and availability.
- **Workflow:**
  1. **Scraping/API:** Identifies creators fitting the target demographic (Gen-Z, expressive, clear audio).
  2. **Outreach:** Sends the standardized UGC Brief.
  3. **Brief Content:** *"Hook: I was skeptical, but this free app read my palm... Request: Show your palm, act shocked at the results, mention it's free to try. Must be 15s max."*
  4. **Ingestion:** Downloads submitted videos.
  5. **Curation:** Uses the Vision API to score the videos on lighting, hook delivery, and energy. Flags the top 10% and uploads them to the Meta Ads/TikTok Ads asset library.

## 3. Technical Constraints
- **Execution:** Must run in a headless environment, highly resilient to Captchas (using tools like 2Captcha or proxy rotation if necessary).
- **LLM Routing:** Powered strictly by **MiniMax 2.7 HighSpeed** for rapid reasoning and execution, with all API calls routed through **Cloudflare AI Gateway** to ensure key security and monitor token usage.
- **State Management:** Agent state, UGC creator records, and posting schedules must be stored in **Cloudflare D1**.
- Logs all actions to a centralized `operations_log.md` for manual auditing.

## 4. Definition of Done
- Agent successfully logs into TikTok, posts a Luma Agent carousel, drops a pinned comment from a burner account, and successfully sends 5 automated UGC requests via a sandbox UGC platform.
