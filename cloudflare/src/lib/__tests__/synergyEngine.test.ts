import { describe, it, expect } from 'vitest';
import { calculateSynergy } from '../synergyEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReading(overrides?: {
  archetype?: string;
  archetypeEmoji?: string;
  lines?: Array<{ type: string; strength: number; archetype: string }>;
}) {
  return {
    archetype: 'Wizard',
    archetypeEmoji: '🧙',
    lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }],
    ...overrides,
  };
}

function calculate(readingA: ReturnType<typeof makeReading>, readingB: ReturnType<typeof makeReading>) {
  return calculateSynergy(readingA as Parameters<typeof calculateSynergy>[0], readingB as Parameters<typeof calculateSynergy>[0], { randomOffset: 0 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateSynergy', () => {
  // -----------------------------------------------------------------------
  // 1) Identical readings produce a high score (> 80)
  // -----------------------------------------------------------------------
  it('should return a score above 80 when readings are identical', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=0 → base=100 → +0 (same archetype) → clamp(20,99,100) = 99
    expect(result.score).toBeGreaterThan(80);
    expect(result.score).toBe(99);
  });

  // -----------------------------------------------------------------------
  // 2) Opposite readings produce a low score
  // -----------------------------------------------------------------------
  it('should return a low score when strengths are opposite (0 vs 100)', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 100, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=100 → base=0 → +0 → clamp(20,99,0) = 20
    expect(result.score).toBe(20);
    expect(result.score).toBeLessThanOrEqual(30);
  });

  // -----------------------------------------------------------------------
  // 3) Different archetypes get +8 bonus
  // -----------------------------------------------------------------------
  it('should add +8 when archetypes differ', () => {
    const readingA = makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] });
    const readingB = makeReading({ archetype: 'Warrior', lines: [{ type: 'heart', strength: 50, archetype: 'Warrior' }] });
    const result = calculate(readingA, readingB);
    // diff=20 → base=80 → +8 (different) = 88 → clamp(20,99,88) = 88
    expect(result.score).toBe(88);

    const sameResult = calculate(
      makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] }),
      makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] }),
    );
    // diff=20 → base=80 → +0 (same) = 80 → clamp(20,99,80) = 80
    expect(sameResult.score).toBe(80);
    // The gap between different vs same archetype is exactly 8
    expect(result.score - sameResult.score).toBe(8);
  });

  it('should include a cross-archetype insight when archetypes differ', () => {
    const result = calculate(
      makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] }),
      makeReading({ archetype: 'Warrior', lines: [{ type: 'heart', strength: 50, archetype: 'Warrior' }] }),
    );
    expect(result.insights).toContain('Wizard × Warrior is lowkey one of the best combos');
  });

  // -----------------------------------------------------------------------
  // 4) Same archetypes get no bonus
  // -----------------------------------------------------------------------
  it('should NOT add bonus when archetypes are the same', () => {
    const readingA = makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] });
    const readingB = makeReading({ archetype: 'Wizard', lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=20 → base=80 → +0 (same) = 80
    expect(result.score).toBe(80);
  });

  it('should include a same-archetype insight when archetypes match', () => {
    const result = calculate(
      makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] }),
      makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] }),
    );
    expect(result.insights).toContain("You're both Wizards — ngl that's powerful");
  });

  // -----------------------------------------------------------------------
  // 5) Score clamping  [20, 99]
  // -----------------------------------------------------------------------
  it('should never exceed 99 even when base score would be higher', () => {
    const result = calculate(
      makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] }),
      makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] }),
    );
    // base=100, clamped to 99
    expect(result.score).toBe(99);
  });

  it('should never go below 20 even when base score would be lower', () => {
    const result = calculate(
      makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] }),
      makeReading({ lines: [{ type: 'heart', strength: 100, archetype: 'Wizard' }] }),
    );
    // base=0, clamped to 20
    expect(result.score).toBe(20);
  });

  it('should clamp values above 99 with positive randomOffset', () => {
    const reading = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const result = calculateSynergy(reading, reading, { randomOffset: 50 });
    // base=100 + 50 = 150 → clamp(20,99,150) = 99
    expect(result.score).toBe(99);
  });

  it('should clamp values below 20 with negative randomOffset', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 100, archetype: 'Wizard' }] });
    const result = calculateSynergy(readingA, readingB, { randomOffset: -50 });
    // base=0 + (-50) = -50 → clamp(20,99,-50) = 20
    expect(result.score).toBe(20);
  });

  // -----------------------------------------------------------------------
  // 6) All MATCH_LABEL buckets are reachable
  // -----------------------------------------------------------------------
  it('should reach "Cosmic Soulmates" bucket (score 90+)', () => {
    // diff=0 → base=100, clamped to 99 → matches >=90
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.matchLabel).toBe('Cosmic Soulmates ✨');
  });

  it('should reach "Twin Flames" bucket (score 75-89)', () => {
    // diff=18 → base=82
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 32, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(82);
    expect(result.matchLabel).toBe('Twin Flames 🔥');
  });

  it('should reach "Kindred Spirits" bucket (score 60-74)', () => {
    // diff=30 → base=70
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 80, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(70);
    expect(result.matchLabel).toBe('Kindred Spirits 💫');
  });

  it('should reach "Yin & Yang" bucket (score 45-59)', () => {
    // diff=50 → base=50
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(50);
    expect(result.matchLabel).toBe('Yin & Yang ☯️');
  });

  it('should reach "Opposites Attract" bucket (score 30-44)', () => {
    // diff=60 → base=40
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 60, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(40);
    expect(result.matchLabel).toBe('Opposites Attract 🧲');
  });

  it('should reach "Wildcard Duo" bucket (score 0-29)', () => {
    // diff=100 → base=0, clamped to 20 → matches <30
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 100, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBeLessThan(30);
    expect(result.matchLabel).toBe('Wildcard Duo 🃏');
  });

  // -----------------------------------------------------------------------
  // 7) Deterministic output when randomOffset is provided
  // -----------------------------------------------------------------------
  it('should produce identical results for identical inputs with the same randomOffset', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] });

    const result1 = calculateSynergy(readingA, readingB, { randomOffset: 0 });
    const result2 = calculateSynergy(readingA, readingB, { randomOffset: 0 });

    expect(result1.score).toBe(result2.score);
    expect(result1.matchLabel).toBe(result2.matchLabel);
    expect(result1.insights).toEqual(result2.insights);
  });

  it('should produce different results for different randomOffset values', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] });
    // base=80, with diff archetype would change things; same archetype keeps base pure

    const resultLow = calculateSynergy(readingA, readingB, { randomOffset: -5 });
    const resultHigh = calculateSynergy(readingA, readingB, { randomOffset: 5 });

    expect(resultLow.score).toBe(75); // 80 - 5 = 75
    expect(resultHigh.score).toBe(85); // 80 + 5 = 85
  });

  // -----------------------------------------------------------------------
  // 8) Line diff < 10 produces "eerily similar" insight
  // -----------------------------------------------------------------------
  it('should push "eerily similar" insight when line strength difference is less than 10', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 55, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=5 < 10
    expect(result.insights).toContain(
      'Your heart lines are eerily similar — you literally think alike fr'
    );
  });

  it('should push "eerily similar" insight for each matched line with diff < 10', () => {
    const readingA = makeReading({
      lines: [
        { type: 'heart', strength: 50, archetype: 'Wizard' },
        { type: 'head', strength: 50, archetype: 'Wizard' },
      ],
    });
    const readingB = makeReading({
      lines: [
        { type: 'heart', strength: 55, archetype: 'Wizard' },
        { type: 'head', strength: 55, archetype: 'Wizard' },
      ],
    });
    const result = calculate(readingA, readingB);
    expect(result.insights).toContain(
      'Your heart lines are eerily similar — you literally think alike fr'
    );
    expect(result.insights).toContain(
      'Your head lines are eerily similar — you literally think alike fr'
    );
  });

  // -----------------------------------------------------------------------
  // 9) Line diff > 40 produces "wildly different" insight
  // -----------------------------------------------------------------------
  it('should push "wildly different" insight when line strength difference is greater than 40', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=50 > 40
    expect(result.insights).toContain(
      'Your heart lines are wildly different — that\'s where the magic happens'
    );
  });

  it('should push "wildly different" insight for each matched line with diff > 40', () => {
    const readingA = makeReading({
      lines: [
        { type: 'heart', strength: 50, archetype: 'Wizard' },
        { type: 'head', strength: 50, archetype: 'Wizard' },
      ],
    });
    const readingB = makeReading({
      lines: [
        { type: 'heart', strength: 0, archetype: 'Wizard' },
        { type: 'head', strength: 0, archetype: 'Wizard' },
      ],
    });
    const result = calculate(readingA, readingB);
    expect(result.insights).toContain(
      'Your heart lines are wildly different — that\'s where the magic happens'
    );
    expect(result.insights).toContain(
      'Your head lines are wildly different — that\'s where the magic happens'
    );
  });

  // -----------------------------------------------------------------------
  // 10) Max 3 insights returned
  // -----------------------------------------------------------------------
  it('should return at most 3 insights even when more would be generated', () => {
    // 3 matched lines with diff < 10 + 1 archetype insight = 4 total, sliced to 3
    const readingA = makeReading({
      archetype: 'Wizard',
      lines: [
        { type: 'heart', strength: 50, archetype: 'Wizard' },
        { type: 'head', strength: 50, archetype: 'Wizard' },
        { type: 'gut', strength: 50, archetype: 'Wizard' },
      ],
    });
    const readingB = makeReading({
      archetype: 'Warrior',
      lines: [
        { type: 'heart', strength: 52, archetype: 'Warrior' },
        { type: 'head', strength: 52, archetype: 'Warrior' },
        { type: 'gut', strength: 52, archetype: 'Warrior' },
      ],
    });
    const result = calculate(readingA, readingB);
    expect(result.insights.length).toBeLessThanOrEqual(3);
    expect(result.insights.length).toBe(3);
  });

  it('should return fewer than 3 insights when fewer are generated', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // diff=20 → no line insight, 1 archetype insight → 1 total
    expect(result.insights.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 11) Empty lines array (edge case — lineCount 0)
  // -----------------------------------------------------------------------
  it('should handle empty lines arrays without crashing', () => {
    const readingA = makeReading({ lines: [] });
    const readingB = makeReading({ lines: [] });
    const result = calculate(readingA, readingB);
    // lineCount=0 → avgDiff=50 → base=50 → score=50
    expect(result.score).toBe(50);
    expect(result.matchLabel).toBe('Yin & Yang ☯️');
  });

  it('should only include archetype insight when lines are empty', () => {
    const readingA = makeReading({ lines: [] });
    const readingB = makeReading({ lines: [] });
    const result = calculate(readingA, readingB);
    expect(result.insights.length).toBe(1);
    expect(result.insights[0]).toContain("You're both Wizards");
  });

  // -----------------------------------------------------------------------
  // 12) Partial line overlap (readingA has lines readingB doesn't)
  // -----------------------------------------------------------------------
  it('should skip lines in readingA that have no match in readingB', () => {
    const readingA = makeReading({
      lines: [
        { type: 'heart', strength: 50, archetype: 'Wizard' },
        { type: 'head', strength: 50, archetype: 'Wizard' },
      ],
    });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 70, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // Only 'heart' matched: diff=|50-70|=20, totalDiff=20, lineCount=1, avgDiff=20
    // base=80, same archetype → score=80
    expect(result.score).toBe(80);

    // 'head' line in A had no match in B, should be skipped silently
    // Only the 'heart' line and archetype insights should appear
    const insightCount = result.insights.length;
    expect(insightCount).toBeGreaterThanOrEqual(1);
  });

  it('should still compute a valid score when no lines overlap', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'head', strength: 50, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    // No matched lines → lineCount=0 → avgDiff=50 → base=50 → score=50
    expect(result.score).toBe(50);
    // No line-level insights, just the archetype insight
    expect(result.insights.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 13) getMatchLabel boundary cases
  // -----------------------------------------------------------------------
  it('should return "Cosmic Soulmates" at the exact boundary score of 90', () => {
    // diff=10 (strength 50 vs 40) → base=90 → same archetype → score=90
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 40, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(90);
    expect(result.matchLabel).toBe('Cosmic Soulmates ✨');
  });

  it('should return "Twin Flames" at the exact boundary score of 75', () => {
    // diff=25 (strength 50 vs 25) → base=75 → same archetype → score=75
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 25, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(75);
    expect(result.matchLabel).toBe('Twin Flames 🔥');
  });

  it('should return "Wildcard Duo" at the exact boundary score of 29', () => {
    // diff=71 (strength 0 vs 71) → base=29 → same archetype → score=29
    // 29 < 30 → Wildcard Duo
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 0, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 71, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(29);
    expect(result.matchLabel).toBe('Wildcard Duo 🃏');
  });

  it('should return "Kindred Spirits" at the exact boundary score of 60', () => {
    // diff=40 → base=60 → same archetype → score=60
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 10, archetype: 'Wizard' }] });
    const result = calculate(readingA, readingB);
    expect(result.score).toBe(60);
    expect(result.matchLabel).toBe('Kindred Spirits 💫');
  });

  // -----------------------------------------------------------------------
  // Additional edge cases
  // -----------------------------------------------------------------------
  it('should work correctly when options is omitted (backward compatibility)', () => {
    const readingA = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const readingB = makeReading({ lines: [{ type: 'heart', strength: 50, archetype: 'Wizard' }] });
    const result = calculateSynergy(readingA, readingB);
    // Should not throw, randomOffset is generated internally
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThanOrEqual(99);
    expect(result.matchLabel).toBeDefined();
    expect(result.insights.length).toBeGreaterThanOrEqual(1);
  });

  it('should generate a valid SynergyResult shape', () => {
    const result = calculate(
      makeReading(),
      makeReading({ lines: [{ type: 'heart', strength: 30, archetype: 'Wizard' }] }),
    );
    expect(result).toHaveProperty('score');
    expect(typeof result.score).toBe('number');
    expect(result).toHaveProperty('matchLabel');
    expect(typeof result.matchLabel).toBe('string');
    expect(result).toHaveProperty('insights');
    expect(Array.isArray(result.insights)).toBe(true);
  });
});
