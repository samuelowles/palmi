/**
 * Lock the synthesis system prompt contract (issue #29).
 *
 * The prompt is the single source of truth shared between
 * `cloudflare/src/lib/synthesizer.ts` and the prompt file at
 * `cloudflare/src/prompts/synthesis.md`. These tests pin the
 * acceptance criteria so a casual edit to the .md file can't
 * silently regress the voice contract, drop the entertainment-only
 * disclaimer, lose the Pro-only future/love/career framing, or
 * reintroduce fortune-teller language.
 */

import { describe, it, expect } from 'vitest';
import SYSTEM_PROMPT from '../../prompts/synthesis.md?raw';

describe('synthesis system prompt (issue #29)', () => {
  it('is loaded as a non-empty string at build time', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it('includes the "for entertainment purposes only" disclaimer', () => {
    expect(SYSTEM_PROMPT).toMatch(/for entertainment purposes only/i);
  });

  it('explicitly forbids fortune-teller framing (AI_RULES §Voice & Tone)', () => {
    // The prompt must call out fortune-teller voice as the thing to avoid.
    expect(SYSTEM_PROMPT).toMatch(/fortune teller/i);
  });

  it('enumerates the Pro-only categories: future, love, career', () => {
    // The proInsight `category` enum must appear in the prompt, with or
    // without inner quotes, mirroring the contract's wire shape.
    const pattern = /future"?\s*\|\s*"?love"?\s*\|\s*"?career/;
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });

  it('requires Pro sections to be framed as self-discovery / personality', () => {
    // Acceptance criterion: "Pro-only sections for future, love, and
    // career insights using self-discovery/personality framing".
    expect(SYSTEM_PROMPT).toMatch(/self.?discovery/i);
    expect(SYSTEM_PROMPT).toMatch(/personality/i);
  });

  it('pins the input contract to the PalmAnalysis JSON shape', () => {
    expect(SYSTEM_PROMPT).toMatch(/PalmAnalysis/);
    expect(SYSTEM_PROMPT).toMatch(/proInsights/);
  });

  it('pins the input `lines` types to heart|head|life|fate', () => {
    const pattern = /heart"?\s*\|\s*"?head"?\s*\|\s*"?life"?\s*\|\s*"?fate/;
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });

  it('bans the generic "Your [line] line shows…" opener', () => {
    // This opener is the dead-giveaway of a fortune-teller app. The
    // prompt must enumerate it as banned so the model does not fall
    // back into it.
    expect(SYSTEM_PROMPT).toMatch(/Your \[line\] line shows/i);
  });
});
