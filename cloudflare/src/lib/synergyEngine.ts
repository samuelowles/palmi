/**
 * Synergy Engine — Palm compatibility comparison
 * Compares two readings and generates a compatibility score + match label.
 */

interface ReadingData {
  archetype: string;
  archetypeEmoji: string;
  lines: Array<{ type: string; strength: number; archetype: string }>;
}

interface SynergyResult {
  score: number;
  matchLabel: string;
  insights: string[];
}

const MATCH_LABELS: Record<string, string> = {
  '90-100': 'Cosmic Soulmates ✨',
  '75-89': 'Twin Flames 🔥',
  '60-74': 'Kindred Spirits 💫',
  '45-59': 'Yin & Yang ☯️',
  '30-44': 'Opposites Attract 🧲',
  '0-29': 'Wildcard Duo 🃏',
};

function getMatchLabel(score: number): string {
  if (score >= 90) return MATCH_LABELS['90-100'];
  if (score >= 75) return MATCH_LABELS['75-89'];
  if (score >= 60) return MATCH_LABELS['60-74'];
  if (score >= 45) return MATCH_LABELS['45-59'];
  if (score >= 30) return MATCH_LABELS['30-44'];
  return MATCH_LABELS['0-29'];
}

export function calculateSynergy(
  readingA: ReadingData,
  readingB: ReadingData,
  options?: { randomOffset?: number }
): SynergyResult {
  const insights: string[] = [];

  // Compare line strengths
  let totalDiff = 0;
  let lineCount = 0;

  for (const lineA of readingA.lines) {
    const lineB = readingB.lines.find((l) => l.type === lineA.type);
    if (lineB) {
      const diff = Math.abs(lineA.strength - lineB.strength);
      totalDiff += diff;
      lineCount++;

      // Generate insight based on comparison
      if (diff < 10) {
        insights.push(`Your ${lineA.type} lines are eerily similar — you literally think alike fr`);
      } else if (diff > 40) {
        insights.push(`Your ${lineA.type} lines are wildly different — that's where the magic happens`);
      }
    }
  }

  // Base compatibility from line similarity (inverse of difference)
  const avgDiff = lineCount > 0 ? totalDiff / lineCount : 50;
  let score = Math.max(0, Math.min(100, Math.round(100 - avgDiff)));

  // Archetype bonus: complementary archetypes get a boost
  if (readingA.archetype !== readingB.archetype) {
    score = Math.min(100, score + 8); // Different archetypes = complementary
    insights.push(`${readingA.archetype} × ${readingB.archetype} is lowkey one of the best combos`);
  } else {
    insights.push(`You're both ${readingA.archetype}s — ngl that's powerful`);
  }

  // Add some controlled randomness for fun
  const randomOffset = options?.randomOffset ?? Math.floor(Math.random() * 10 - 5);
  score = Math.max(20, Math.min(99, score + randomOffset));

  return {
    score,
    matchLabel: getMatchLabel(score),
    insights: insights.slice(0, 3), // Max 3 insights
  };
}
