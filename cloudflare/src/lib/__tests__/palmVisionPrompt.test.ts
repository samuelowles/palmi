/**
 * Lock the palm-vision system prompt contract (issue #27).
 *
 * The prompt is the single source of truth shared between
 * `palmVision.ts` and the prompt file at
 * `cloudflare/src/prompts/palmVision.md`. These tests pin the
 * acceptance criteria so a casual edit to the .md file can't silently
 * regress the JSON contract or drop the entertainment-only framing.
 */

import { describe, it, expect } from 'vitest';
import SYSTEM_PROMPT from '../../prompts/palmVision.md';

describe('palm-vision system prompt (issue #27)', () => {
  it('is loaded as a non-empty string at build time', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('includes the "for entertainment purposes only" framing (AI_RULES §Voice & Tone)', () => {
    expect(SYSTEM_PROMPT).toMatch(/for entertainment purposes only/i);
  });

  it('instructs the model to return strict JSON matching the PalmAnalysis contract', () => {
    // The contract lives at cloudflare/src/contracts/palmAnalysis.ts.
    // The prompt must reference it explicitly so the model knows the
    // exact shape to emit, and must forbid prose/markdown around the
    // JSON payload.
    expect(SYSTEM_PROMPT).toMatch(/PalmAnalysis/);
    expect(SYSTEM_PROMPT).toMatch(/JSON/);
    expect(SYSTEM_PROMPT).toMatch(/No prose/);
    expect(SYSTEM_PROMPT).toMatch(/no markdown fences/);
  });

  it('enumerates the top-level keys required by PalmAnalysis', () => {
    for (const key of ['lines', 'overallArchetype', 'overallArchetypeEmoji', 'overallSummary', 'proInsights']) {
      expect(SYSTEM_PROMPT).toContain(key);
    }
  });

  it('pins the line `type` enum to heart|head|life|fate (with or without inner quotes)', () => {
    // The prompt may render the enum as `heart | head | life | fate`
    // or as `"heart" | "head" | "life" | "fate"`. Both convey the same
    // contract to the model; accept either form so the wording stays
    // human-friendly in the .md.
    const pattern = /heart"?\s*\|\s*"?head"?\s*\|\s*"?life"?\s*\|\s*"?fate/;
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });

  it('pins the proInsight `category` enum to future|love|career (with or without inner quotes)', () => {
    const pattern = /future"?\s*\|\s*"?love"?\s*\|\s*"?career/;
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });
});
