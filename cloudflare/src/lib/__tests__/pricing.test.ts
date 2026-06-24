/**
 * Pricing unit tests — Issue #31.
 *
 * Locks the AC "Cost computed from token usage (vision + synthesis) using
 * current model pricing" and "Non-blocking: cost write failure does not
 * break the user response" at the unit boundary. The route-handler wiring
 * test (POST /api/read-palm) sits in routes/__tests__/palmCost.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCallCostUsd,
  computeReadingCostUsd,
  FALLBACK_READING_COST_USD,
  SYNTHESIS_PRICING,
  VISION_PRICING,
  type TokenUsage,
} from '../pricing';

describe('computeCallCostUsd', () => {
  it('returns 0 when usage is null', () => {
    expect(computeCallCostUsd(null, VISION_PRICING)).toBe(0);
    expect(computeCallCostUsd(undefined, VISION_PRICING)).toBe(0);
  });

  it('multiplies prompt × input rate and completion × output rate', () => {
    const usage: TokenUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
    // 1000 × ($0.15 / 1M) + 500 × ($0.60 / 1M) = 0.00015 + 0.0003 = 0.00045
    expect(computeCallCostUsd(usage, VISION_PRICING)).toBeCloseTo(0.00045, 8);
  });

  it('uses the synthesis pricing band independently', () => {
    const usage: TokenUsage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    // 1M × $0.27 + 1M × $1.10 = $1.37
    expect(computeCallCostUsd(usage, SYNTHESIS_PRICING)).toBeCloseTo(1.37, 8);
  });

  it('clamps NaN token counts to 0 (no NaN leaks out)', () => {
    const usage = { promptTokens: NaN, completionTokens: NaN, totalTokens: NaN } as unknown as TokenUsage;
    expect(computeCallCostUsd(usage, VISION_PRICING)).toBe(0);
  });

  it('clamps negative token counts to 0', () => {
    const usage: TokenUsage = { promptTokens: -100, completionTokens: -50, totalTokens: -150 };
    expect(computeCallCostUsd(usage, VISION_PRICING)).toBe(0);
  });
});

describe('computeReadingCostUsd (issue #31 AC)', () => {
  it('falls back to FALLBACK_READING_COST_USD when vision usage is missing', () => {
    // AC "Cost computed from token usage" → if no usage at all, fall back
    // rather than silently log $0 and break unit-economics dashboards.
    expect(computeReadingCostUsd(null, null)).toBe(FALLBACK_READING_COST_USD);
    expect(computeReadingCostUsd(undefined, undefined)).toBe(FALLBACK_READING_COST_USD);
  });

  it('sums vision cost + synthesis cost when both usages are present', () => {
    const vision: TokenUsage = { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 };
    const synth: TokenUsage = { promptTokens: 500, completionTokens: 300, totalTokens: 800 };
    const expected =
      computeCallCostUsd(vision, VISION_PRICING) + computeCallCostUsd(synth, SYNTHESIS_PRICING);
    expect(computeReadingCostUsd(vision, synth)).toBeCloseTo(expected, 10);
  });

  it('returns the fallback when both usages are zero (monitoring does not flatline)', () => {
    const zero: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    expect(computeReadingCostUsd(zero, zero)).toBe(FALLBACK_READING_COST_USD);
  });

  it('never throws on malformed payloads (non-blocking AC)', () => {
    // The route handler wraps this in try/catch, but the function itself
    // must also be defensive: a usage object full of NaN should not throw.
    const malformed = { promptTokens: NaN, completionTokens: Infinity, totalTokens: -1 } as unknown as TokenUsage;
    expect(() => computeReadingCostUsd(malformed, null)).not.toThrow();
  });

  it('produces a non-NaN, non-negative number in all branches', () => {
    const vision: TokenUsage = { promptTokens: 123, completionTokens: 45, totalTokens: 168 };
    const synth: TokenUsage = { promptTokens: 50, completionTokens: 80, totalTokens: 130 };
    for (const v of [null, undefined, vision]) {
      for (const s of [null, undefined, synth]) {
        const cost = computeReadingCostUsd(v, s);
        expect(Number.isFinite(cost)).toBe(true);
        expect(cost).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
