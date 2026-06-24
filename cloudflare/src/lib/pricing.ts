/**
 * Pricing — per-token USD cost for the AI providers used by the reading pipeline.
 *
 * Source-of-truth constants for the `estimated_ai_cost` written to the
 * `readings` table (PRD §5.1, DEPLOY §5.4). The values mirror publicly listed
 * rates for each model's tier:
 *
 *   - GPT-5.4-mini   → matches OpenAI gpt-4o-mini pricing band
 *                       ($0.15 / 1M input, $0.60 / 1M output)
 *   - DeepSeek V4    → matches DeepSeek-V3 pricing band
 *                       ($0.27 / 1M input, $1.10 / 1M output)
 *
 * Update these when the underlying model price changes; cost accuracy is
 * the whole point of issue #31.
 */

export interface TokenUsage {
  /** Tokens consumed by the request payload (prompt + image tokens for vision). */
  promptTokens: number;
  /** Tokens produced by the model. */
  completionTokens: number;
  /** prompt + completion. May be reported directly by the provider. */
  totalTokens: number;
}

/** Per-million-token USD price for the vision model (GPT-5.4-mini). */
export const VISION_PRICING = {
  inputPerMTokensUsd: 0.15,
  outputPerMTokensUsd: 0.6,
} as const;

/** Per-million-token USD price for the synthesis model (DeepSeek V4 Flash). */
export const SYNTHESIS_PRICING = {
  inputPerMTokensUsd: 0.27,
  outputPerMTokensUsd: 1.1,
} as const;

/**
 * Fallback cost (USD) used when token usage is unavailable from the upstream
 * providers. Matches the previous hard-coded estimate in
 * `routes/palm.ts` so unit-economics dashboards stay continuous across the
 * #31 migration. Kept conservative (rounds up) so missing-usage weeks do
 * not understate spend.
 */
export const FALLBACK_READING_COST_USD = 0.00248;

/** USD per token for a given per-million price. */
function usdPerToken(perMTokensUsd: number): number {
  return perMTokensUsd / 1_000_000;
}

/**
 * Cost in USD for a single API call given its token usage and pricing band.
 * Missing or non-finite token counts are treated as zero so a partial
 * usage payload (e.g. only `total_tokens` reported) never produces NaN.
 */
export function computeCallCostUsd(
  usage: TokenUsage | null | undefined,
  pricing: { inputPerMTokensUsd: number; outputPerMTokensUsd: number },
): number {
  if (!usage) return 0;
  const prompt = Number.isFinite(usage.promptTokens) ? Math.max(0, usage.promptTokens) : 0;
  const completion = Number.isFinite(usage.completionTokens)
    ? Math.max(0, usage.completionTokens)
    : 0;
  return (
    prompt * usdPerToken(pricing.inputPerMTokensUsd) +
    completion * usdPerToken(pricing.outputPerMTokensUsd)
  );
}

/**
 * Cost of one full reading (vision + synthesis). Returns `FALLBACK_READING_COST_USD`
 * when the vision provider did not report usage (so we never silently log $0
 * and break unit-economics tracking).
 *
 * Wrapped in try/catch by callers so a malformed usage payload (NaN,
 * negative, etc.) does not break the user response — see issue #31
 * acceptance criterion "Non-blocking: cost write failure does not break the user response".
 */
export function computeReadingCostUsd(
  visionUsage: TokenUsage | null | undefined,
  synthesisUsage: TokenUsage | null | undefined,
): number {
  if (!visionUsage) return FALLBACK_READING_COST_USD;
  const visionCost = computeCallCostUsd(visionUsage, VISION_PRICING);
  const synthCost = computeCallCostUsd(synthesisUsage, SYNTHESIS_PRICING);
  const total = visionCost + synthCost;
  // If we got a vision usage object but every component was 0 (or NaN-grepped
  // to 0), still log a non-zero value so monitoring does not flatline.
  if (!Number.isFinite(total) || total <= 0) return FALLBACK_READING_COST_USD;
  return total;
}
