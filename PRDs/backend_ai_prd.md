# Product Requirements Document (PRD): Backend AI & Reading Generation

## 1. Executive Summary
This PRD outlines the architecture and prompts for the backend engine responsible for analyzing palm images and generating the core content of the application. It relies strictly on **OpenAI Image 2 (GPT Image-2)** as the vision model to read the palm, followed by an LLM text-generation phase to synthesize the reading.

## 2. Core Components

### 2.1 The Vision Engine (OpenAI Image 2)
- **Input:** High-resolution cropped image of the user's palm from the iOS app.
- **Process:** Send the image to the OpenAI Image 2 API (vision endpoint) with a highly specific system prompt to act as an expert palm reader.
- **Vision Prompt Strategy:**
  > "You are an expert palm reader. Analyze this image of a human palm. Locate and trace the three major lines: the Heart line, the Head line, and the Life line. Output a structured JSON response detailing the length, depth, curvature, and any notable breaks or intersections of these three lines. Be extremely precise."

### 2.2 The Synthesizer (Text LLM)
- **Input:** The structured JSON output from the Vision Engine, plus basic user data (optional: name/zodiac sign).
- **Process:** Generate a compelling, "Gen-Z aesthetic" palm reading.
- **Output Structure:**
  - `free_section`: Relatable, engaging summary of the Heart and Head lines. (Approx. 100 words).
  - `premium_section`: Deep-dive into the Life line, future predictions, love, and career. (Approx. 200 words).
- **Tone Guidelines:** Astrological, empathetic, slightly edgy ("vibe code"), but ultimately positive and empowering. Avoid overly negative or deterministic predictions.

### 2.3 The Synergy Engine (Viral Loop)
- **Input:** Two stored JSON analyses of two different palms.
- **Process:** Compare the data points of both palms.
- **Output:** A combined reading highlighting areas of alignment and areas of friction.
- **Payload:** Must return a `synergy_score` (1-100), a `relationship_archetype` (e.g., "Chaotic Good Duo", "Soul Ties"), and a short paragraph summarizing their compatibility.

## 3. Cloudflare Architecture & Security
- **API Hosting:** The entire backend API is deployed on **Cloudflare Workers** for globally distributed, low-latency execution.
- **LLM Routing:** All calls to OpenAI Image 2 and the Synthesizer LLM MUST be routed through **Cloudflare AI Gateway**. This ensures strict management of LLM API keys, provides built-in caching, rate limiting, and observability without exposing keys in the Worker code.
- **Data Storage:** The extracted JSON data for the Synergy Engine is stored in **Cloudflare D1** (for relational querying of users and synergy scores) and **Cloudflare KV** (for rapid read-access of individual readings).
- **Security & Deletion:** The API endpoints are protected by Cloudflare WAF. Palm images must be deleted immediately after analysis to ensure privacy compliance. Only the extracted JSON data is persisted.

## 4. Scalability & Latency
- The entire process (Image Upload -> Cloudflare Worker -> AI Gateway -> OpenAI Image 2 -> LLM Synthesis -> Response) must complete in **under 8 seconds** to prevent user drop-off.
- Implement aggressive caching via Cloudflare AI Gateway and Edge caching where applicable.

## 5. Definition of Done
- Endpoint accepts image, successfully proxies to OpenAI Image 2, and returns the expected 2-part JSON reading format.
- Synergy endpoint successfully takes two user IDs and returns a compatibility score.
- Images are confirmed deleted post-processing.
