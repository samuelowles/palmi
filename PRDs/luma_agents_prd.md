# Product Requirements Document (PRD): Luma Agents (Content Creation Engine)

## 1. Executive Summary
This PRD defines the specifications for the automated "Luma Agents"—a content engine responsible for autonomously generating highly engaging, relatable TikTok slideshows that drive organic traffic to the app's "link in bio." 

## 2. Core Strategy
The primary content format is **TikTok Slideshows (Carousels)**.
- **Theme:** Stories of how palm reading changed a person's life, revealed a hidden truth, or exposed relationship drama.
- **Visuals:** Relatable, moody imagery generated via OpenAI.
- **Hook:** High-drama text overlays.

## 3. Agent Workflow

### 3.1 Story Generation (Text LLM)
- **Routing:** All LLM calls must be routed securely through **Cloudflare AI Gateway** to manage rate limits and cache repeated system prompts.
- **Prompt:** "Write a 4-part short story for a TikTok slideshow. The story must be a first-person confession about a dramatic life event (e.g., finding out a boyfriend was cheating, deciding to quit a toxic job, realizing a friend was fake). The turning point of the story must be when the narrator used a free palm reading app. Keep the text extremely short, colloquial (use slang like 'fr', 'ngl', 'vibes'), and engaging."
- **Output:** JSON array with 4 string elements, representing the text for each slide.

### 3.2 Visual Generation (OpenAI Image 2)
- **Process:** For each of the 4 slides, the agent requests a background image from OpenAI Image 2.
- **Visual Prompt Guidelines:**
  - "POV, slightly blurry, aesthetic, dark mode, iPhone camera roll aesthetic."
  - **Slide 1:** A moody bedroom, looking out a window.
  - **Slide 2:** Text messages or a coffee shop table.
  - **Slide 3:** Abstract, mystical neon lights or a glowing phone screen.
  - **Slide 4:** A peaceful sunset or clear sky.
- **Constraint:** Images must be strictly **9:16 aspect ratio**.

### 3.3 Asset Assembly
- The agent takes the generated 9:16 images and overlays the text from the Story Generation phase.
- **Typography:** Use a font that mimics native TikTok text (e.g., Proxima Nova, white text with a black background box for readability).
- **Positioning:** Text must be placed in the center-bottom, avoiding the TikTok UI safe zones (right side and bottom).

## 4. Delivery
- The Luma Agent outputs a zipped folder containing the ordered images (e.g., `01.jpg`, `02.jpg`, `03.jpg`, `04.jpg`) alongside a `metadata.json` containing the suggested TikTok caption and hashtags (e.g., `#palmreading #storytime #astrology`).
- This package is handed off to the Hermes Agent for distribution.

## 5. Daily Volume Requirements
- The agent must be capable of generating **10 unique slideshows per day** completely autonomously.

## 6. Definition of Done
- A single script/agent execution successfully outputs a folder with 4 perfectly formatted, text-overlayed 9:16 images and a caption, ready for immediate upload to TikTok.
