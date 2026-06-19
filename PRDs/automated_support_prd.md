# Product Requirements Document (PRD): Automated Support & Community

## 1. Executive Summary
To ensure this business operates passively, all tier-1 and tier-2 customer support must be entirely automated. This PRD outlines the AI-driven support systems responsible for managing App Store reviews and email inquiries.

## 2. App Store Review Management
- **Objective:** Maintain a high App Store rating and respond to feedback instantly.
- **Workflow:**
  1. An automation script (e.g., via Make/Zapier or a custom chron job) monitors the App Store Connect API for new reviews.
  2. The review text and star rating are passed to an LLM.
  3. **Positive Reviews (4-5 Stars):** The LLM generates a personalized "thank you" response reflecting the "vibe" aesthetic.
  4. **Negative Reviews (1-3 Stars):** The LLM generates an empathetic apology, offers a solution, and if a bug is mentioned, extracts the bug description and posts it to a designated Slack/Discord channel for developer review.
  5. The generated response is automatically published back to the App Store.

## 3. Email Support Agent
- **Objective:** Handle billing inquiries, refund requests, and general usage questions autonomously.
- **Tooling:** Intercom Fin, Zendesk AI, or a custom email agent built on the Hermes framework.
- **Knowledge Base:**
  - The agent must be trained on a strict set of FAQs:
    - *How to cancel a subscription* (Point them to iOS settings).
    - *Refund Policy* (Apple handles all refunds; the agent must kindly explain that developers cannot process refunds directly and provide the Apple support link).
    - *Accuracy of Readings* (A disclaimer that readings are for entertainment purposes only).
- **Escalation Protocol:** If the LLM determines a query is outside its knowledge base (e.g., a critical legal or security threat), it flags the email in a priority inbox and does NOT reply automatically.

## 4. Definition of Done
- Test emails regarding refunds are correctly answered with the Apple Support link.
- A 1-star test review mentioning a crash successfully triggers a Slack alert.
