/**
 * PalmAnalysis contract — source of truth for the structured JSON shape
 * produced by the vision call and consumed by the synthesis service.
 *
 * Used by both `cloudflare/src/lib/palmVision.ts` (producer) and
 * `cloudflare/src/lib/synthesizer.ts` (consumer). The contract is
 * intentionally hand-rolled — no validation library is added to keep
 * the Worker bundle small. See PRD §5.1 and ARCHITECTURE §Data Flow.
 */

/** Allowed line-type discriminators. */
export type PalmLineType = 'heart' | 'head' | 'life' | 'fate';

const PALM_LINE_TYPES: ReadonlyArray<PalmLineType> = ['heart', 'head', 'life', 'fate'];

export function isPalmLineType(value: unknown): value is PalmLineType {
  return typeof value === 'string' && (PALM_LINE_TYPES as ReadonlyArray<string>).includes(value);
}

/** Categories of pro-tier insights (PRD §3.2). */
export type ProInsightCategory = 'future' | 'love' | 'career';

const PRO_INSIGHT_CATEGORIES: ReadonlyArray<ProInsightCategory> = ['future', 'love', 'career'];

export function isProInsightCategory(value: unknown): value is ProInsightCategory {
  return (
    typeof value === 'string' &&
    (PRO_INSIGHT_CATEGORIES as ReadonlyArray<string>).includes(value)
  );
}

/** A single palm line entry inside a PalmAnalysis. */
export interface PalmLine {
  type: PalmLineType;
  label: string;
  /** Depth/clarity score in the inclusive range 0–100. */
  strength: number;
  archetype: string;
  emoji: string;
  shortSummary: string;
  rawAnalysis: string;
}

/** Pro-tier insight attached to a reading. Optional on the wire. */
export interface ProInsight {
  category: ProInsightCategory;
  text: string;
}

/** Top-level structured output of the palm-vision call. */
export interface PalmAnalysis {
  lines: PalmLine[];
  overallArchetype: string;
  overallArchetypeEmoji: string;
  overallSummary: string;
  /** Pro-tier insights — may be omitted when the AI returns none. */
  proInsights?: ProInsight[];
}

/** Result envelope from {@link validatePalmAnalysis}. */
export interface PalmAnalysisValidation {
  valid: boolean;
  errors: string[];
}

/** Bound a numeric strength value to the 0–100 range, rounding to an integer. */
function clampStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

/**
 * Validate that an unknown value conforms to the {@link PalmAnalysis} contract.
 * Returns a validation envelope — does not throw and does not mutate input.
 *
 * This is the schema's source of truth: callers must consult `valid` before
 * trusting the input.
 */
export function validatePalmAnalysis(input: unknown): PalmAnalysisValidation {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['PalmAnalysis must be a non-null object'] };
  }

  const root = input as Record<string, unknown>;

  if (!Array.isArray(root.lines)) {
    errors.push('PalmAnalysis.lines must be an array');
    return { valid: false, errors };
  }

  root.lines.forEach((line, index) => {
    if (!line || typeof line !== 'object') {
      errors.push(`lines[${index}] must be an object`);
      return;
    }
    const l = line as Record<string, unknown>;
    if (!isPalmLineType(l.type)) {
      errors.push(`lines[${index}].type must be one of heart|head|life|fate`);
      return;
    }
    if (typeof l.strength !== 'number' || !Number.isFinite(l.strength)) {
      errors.push(`lines[${index}].strength must be a number`);
    } else if (l.strength < 0 || l.strength > 100) {
      errors.push(`lines[${index}].strength must be within 0–100`);
    }
    if (typeof l.archetype !== 'string' || l.archetype.length === 0) {
      errors.push(`lines[${index}].archetype must be a non-empty string`);
    }
  });

  if (typeof root.overallArchetype !== 'string') {
    errors.push('overallArchetype must be a string');
  }
  if (typeof root.overallArchetypeEmoji !== 'string') {
    errors.push('overallArchetypeEmoji must be a string');
  }
  if (typeof root.overallSummary !== 'string') {
    errors.push('overallSummary must be a string');
  }

  if (root.proInsights !== undefined) {
    if (!Array.isArray(root.proInsights)) {
      errors.push('proInsights must be an array when present');
    } else {
      root.proInsights.forEach((insight, index) => {
        if (!insight || typeof insight !== 'object') {
          errors.push(`proInsights[${index}] must be an object`);
          return;
        }
        const p = insight as Record<string, unknown>;
        if (!isProInsightCategory(p.category)) {
          errors.push(`proInsights[${index}].category must be future|love|career`);
        }
        if (typeof p.text !== 'string' || p.text.length === 0) {
          errors.push(`proInsights[${index}].text must be a non-empty string`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and normalize an unknown value into a {@link PalmAnalysis}.
 *
 * - Coerces out-of-range `strength` values into 0–100 and defaults missing
 *   scalars to the same fallback values used by the original palmVision code.
 * - Throws when the value cannot be made to conform (missing `lines` array,
 *   wrong root type). Callers that want a non-throwing check should use
 *   {@link validatePalmAnalysis} first.
 */
export function parsePalmAnalysis(input: unknown): PalmAnalysis {
  if (!input || typeof input !== 'object') {
    throw new Error('PalmAnalysis must be a non-null object');
  }

  const root = input as Record<string, unknown>;
  const rawLines = Array.isArray(root.lines) ? root.lines : null;
  if (!rawLines) {
    throw new Error('PalmAnalysis.lines must be an array');
  }

  const lines: PalmLine[] = rawLines.map((line) => {
    const l = (line && typeof line === 'object' ? line : {}) as Record<string, unknown>;
    const type: PalmLineType = isPalmLineType(l.type) ? l.type : 'life';
    return {
      type,
      label: nonEmptyString(l.label, 'Palm Line'),
      strength: clampStrength(l.strength),
      archetype: nonEmptyString(l.archetype, 'The Mystery'),
      emoji: nonEmptyString(l.emoji, '🔮'),
      shortSummary: nonEmptyString(l.shortSummary, 'Your palm tells a story.'),
      rawAnalysis: nonEmptyString(l.rawAnalysis, 'Analysis unavailable.'),
    };
  });

  const proInsights: ProInsight[] | undefined =
    Array.isArray(root.proInsights)
      ? root.proInsights
          .filter((insight): insight is Record<string, unknown> => !!insight && typeof insight === 'object')
          .map((insight) => ({
            category: isProInsightCategory(insight.category) ? insight.category : 'future',
            text: nonEmptyString(insight.text, ''),
          }))
          .filter((insight) => insight.text.length > 0)
      : undefined;

  const analysis: PalmAnalysis = {
    lines,
    overallArchetype: nonEmptyString(root.overallArchetype, 'The Mystery'),
    overallArchetypeEmoji: nonEmptyString(root.overallArchetypeEmoji, '🔮'),
    overallSummary: typeof root.overallSummary === 'string' ? root.overallSummary : '',
  };

  if (proInsights) {
    analysis.proInsights = proInsights;
  }

  return analysis;
}
