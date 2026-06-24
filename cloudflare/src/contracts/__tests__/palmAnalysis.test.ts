/**
 * Focused contract tests for the PalmAnalysis schema (issue #26).
 *
 * The contract is the source of truth shared by palmVision and the
 * synthesis service. These tests cover the acceptance criteria:
 *   - line types (heart/head/life/fate)
 *   - strengths (0–100)
 *   - archetypes
 *   - scores
 *   - proInsights (future/love/career)
 */

import { describe, it, expect } from 'vitest';
import {
  validatePalmAnalysis,
  parsePalmAnalysis,
  isPalmLineType,
  isProInsightCategory,
  type PalmAnalysis,
  type PalmLine,
  type PalmLineType,
  type ProInsightCategory,
} from '../palmAnalysis';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<{
  type: PalmLineType;
  strength: number;
  archetype: string;
}> = {}): PalmLine {
  return {
    type: 'heart',
    label: 'Heart Line',
    strength: 80,
    archetype: 'The Main Character',
    emoji: '💖',
    shortSummary: 'Big romantic energy.',
    rawAnalysis: 'You feel deeply and lead with your heart.',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<PalmAnalysis> = {}): PalmAnalysis {
  return {
    lines: [makeLine()],
    overallArchetype: 'The Main Character',
    overallArchetypeEmoji: '💖',
    overallSummary: 'A bold romantic arc.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('PalmAnalysis type guards', () => {
  it.each(['heart', 'head', 'life', 'fate'])('accepts %s as a line type', (type) => {
    expect(isPalmLineType(type)).toBe(true);
  });

  it.each(['future', 'love', 'career'])('accepts %s as a pro insight category', (category) => {
    expect(isProInsightCategory(category)).toBe(true);
  });

  it('rejects unknown line types', () => {
    expect(isPalmLineType('wealth')).toBe(false);
    expect(isPalmLineType(undefined)).toBe(false);
    expect(isPalmLineType(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePalmAnalysis
// ---------------------------------------------------------------------------

describe('validatePalmAnalysis', () => {
  it('accepts a well-formed analysis', () => {
    const result = validatePalmAnalysis(makeAnalysis());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a non-object root', () => {
    const result = validatePalmAnalysis(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/);
  });

  it('rejects when lines is missing', () => {
    const result = validatePalmAnalysis({ overallArchetype: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /lines/.test(e))).toBe(true);
  });

  it('rejects unknown line types', () => {
    const analysis = makeAnalysis({ lines: [makeLine({ type: 'mystery' as unknown as PalmLineType })] });
    const result = validatePalmAnalysis(analysis);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /type must be one of heart/.test(e))).toBe(true);
  });

  it('rejects out-of-range strength', () => {
    const tooLow = validatePalmAnalysis(makeAnalysis({ lines: [makeLine({ strength: -10 })] }));
    expect(tooLow.valid).toBe(false);
    expect(tooLow.errors.some((e) => /0.100/.test(e))).toBe(true);

    const tooHigh = validatePalmAnalysis(makeAnalysis({ lines: [makeLine({ strength: 250 })] }));
    expect(tooHigh.valid).toBe(false);
    expect(tooHigh.errors.some((e) => /0.100/.test(e))).toBe(true);
  });

  it('rejects empty archetype strings', () => {
    const result = validatePalmAnalysis(makeAnalysis({ lines: [makeLine({ archetype: '' })] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /archetype/.test(e))).toBe(true);
  });

  it('accepts well-formed proInsights', () => {
    const result = validatePalmAnalysis(
      makeAnalysis({
        proInsights: [
          { category: 'future', text: 'Big moves ahead.' },
          { category: 'love', text: 'A meaningful connection is forming.' },
          { category: 'career', text: 'Your grind is about to compound.' },
        ],
      })
    );
    expect(result.valid).toBe(true);
  });

  it('rejects malformed proInsights', () => {
    const analysis = makeAnalysis({
      proInsights: [{ category: 'health' as unknown as ProInsightCategory, text: '' }],
    });
    const result = validatePalmAnalysis(analysis);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /category/.test(e))).toBe(true);
    expect(result.errors.some((e) => /text/.test(e))).toBe(true);
  });

  it('treats proInsights as optional', () => {
    const without = makeAnalysis();
    delete (without as { proInsights?: unknown }).proInsights;
    expect(validatePalmAnalysis(without).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parsePalmAnalysis
// ---------------------------------------------------------------------------

describe('parsePalmAnalysis', () => {
  it('returns a normalized analysis with all fields populated', () => {
    const parsed = parsePalmAnalysis(makeAnalysis());
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].type).toBe('heart');
    expect(parsed.lines[0].strength).toBe(80);
    expect(parsed.lines[0].archetype).toBe('The Main Character');
    expect(parsed.overallArchetype).toBe('The Main Character');
    expect(parsed.proInsights).toBeUndefined();
  });

  it('clamps out-of-range strength to 0–100', () => {
    const parsed = parsePalmAnalysis(
      makeAnalysis({ lines: [makeLine({ strength: 999 }), makeLine({ type: 'head', strength: -50 })] })
    );
    expect(parsed.lines[0].strength).toBe(100);
    expect(parsed.lines[1].strength).toBe(0);
  });

  it('applies default fallback values when fields are missing', () => {
    const parsed = parsePalmAnalysis({ lines: [{}] });
    expect(parsed.lines[0].type).toBe('life');
    expect(parsed.lines[0].label).toBe('Palm Line');
    expect(parsed.lines[0].strength).toBe(50);
    expect(parsed.lines[0].archetype).toBe('The Mystery');
    expect(parsed.lines[0].emoji).toBe('🔮');
    expect(parsed.lines[0].shortSummary).toBe('Your palm tells a story.');
    expect(parsed.lines[0].rawAnalysis).toBe('Analysis unavailable.');
    expect(parsed.overallArchetype).toBe('The Mystery');
    expect(parsed.overallArchetypeEmoji).toBe('🔮');
  });

  it('preserves valid proInsights on parsed output', () => {
    const parsed = parsePalmAnalysis(
      makeAnalysis({
        proInsights: [
          { category: 'future', text: 'Big moves ahead.' },
          { category: 'love', text: 'Hearts align soon.' },
        ],
      })
    );
    expect(parsed.proInsights).toHaveLength(2);
    expect(parsed.proInsights?.[0].category).toBe('future');
  });

  it('throws when lines is missing', () => {
    expect(() => parsePalmAnalysis({ overallArchetype: 'x' })).toThrow(/lines/);
  });

  it('throws when root is not an object', () => {
    expect(() => parsePalmAnalysis('not an object')).toThrow(/non-null object/);
  });
});
