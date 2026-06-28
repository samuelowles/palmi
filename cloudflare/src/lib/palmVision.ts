/**
 * Palm Vision — OpenAI GPT-5.4-mini vision integration
 * Analyzes palm photos and returns structured line data.
 *
 * The output shape is defined by the `PalmAnalysis` contract in
 * `cloudflare/src/contracts/palmAnalysis.ts`, which is the single source of
 * truth shared with the synthesis service.
 *
 * The system prompt lives in `cloudflare/src/prompts/palmVision.md` and is
 * bundled at build time as a UTF-8 string export by wrangler's
 * `[[rules]] type = "Text"` block in `cloudflare/wrangler.toml`
 * (issue #191). No runtime FS access needed in the Worker.
 * See issue #27.
 */

import {
  parsePalmAnalysis,
  validatePalmAnalysis,
  type PalmAnalysis,
} from '../contracts/palmAnalysis';
import SYSTEM_PROMPT from '../prompts/palmVision.md';
import type { TokenUsage } from './pricing';

interface OpenAIVisionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      /**
       * Set when the model declines to analyze the image (content policy,
       * safety, or unsupported input). The text itself is NOT forwarded to
       * the route — issue #89 requires that error bodies never leak
       * upstream details, and the refusal string can include vendor-formatted
       * classifications we don't want to expose.
       */
      refusal?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Default per-call timeout for the OpenAI vision request. Issue #98. */
const DEFAULT_VISION_TIMEOUT_MS = 10_000;

/** Result envelope from {@link analyzePalm}. */
export interface PalmVisionResult {
  analysis: PalmAnalysis;
  /** Token usage as reported by the OpenAI API. `null` when missing. */
  usage: TokenUsage | null;
}

/**
 * Typed error thrown by {@link analyzePalm}.
 *
 * `code` discriminates the failure mode so callers (e.g. the route handler)
 * can map it to the right user-facing message without parsing English prose,
 * and so the message string itself never needs to embed raw vendor data
 * (request/response bodies, image bytes, API keys).
 */
export class PalmVisionError extends Error {
  readonly code: 'upstream_unavailable' | 'invalid_response' | 'no_content' | 'refusal';

  constructor(
    code: 'upstream_unavailable' | 'invalid_response' | 'no_content' | 'refusal',
    message: string,
  ) {
    super(message);
    this.name = 'PalmVisionError';
    this.code = code;
  }
}

export async function analyzePalm(
  imageBase64: string,
  apiKey: string,
  /**
   * Per-call timeout in milliseconds. Issue #98: configurable, defaults to
   * {@link DEFAULT_VISION_TIMEOUT_MS} (10 s). Surfaced as `upstream_unavailable`
   * so the route returns 502 — never leaked as a 504 / network error to the
   * client.
   */
  timeoutMs: number = DEFAULT_VISION_TIMEOUT_MS,
): Promise<PalmVisionResult> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this palm and provide a detailed reading.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 2000,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Issue #98: a timeout (AbortSignal.timeout fires) maps to
    // `upstream_unavailable` so the route returns 502. Other fetch-level
    // failures (DNS, connection reset, unexpected throws from a custom
    // fetch shim) propagate so the route's outer catch emits a generic
    // 500 / internal_error.
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`OpenAI vision request timed out after ${timeoutMs}ms`);
      throw new PalmVisionError('upstream_unavailable', 'Analysis service unavailable');
    }
    throw err;
  }

  if (!response.ok) {
    // Consume the body so the connection can be reused, but do not log or
    // embed it — it can echo back parts of our request (Authorization header,
    // base64 image payload, request id) which would leak secrets/raw image
    // bytes. The status code is enough for ops triage.
    await response.text();
    console.error(`OpenAI API returned ${response.status}`);
    throw new PalmVisionError('upstream_unavailable', 'Analysis service unavailable');
  }

  const data = await response.json() as OpenAIVisionResponse;
  const refusal = data.choices?.[0]?.message?.refusal;

  // Model declined to analyze the image — typically a content-policy
  // refusal. Issue #89 surfaces this as a 422 to the client. Issue #99
  // requires the original refusal reason to be logged server-side for
  // ops triage, but it must NEVER reach the client response: the refusal
  // string can hint at vendor-side classification rules we don't want
  // to expose. The thrown error keeps a generic message; the original
  // text is truncated to keep the log line bounded.
  if (refusal) {
    // Cap the logged reason at 500 chars — vendor refusal text is
    // short, but a generous cap protects against accidental log spam
    // without losing the ops-triage signal.
    const loggedRefusal = refusal.length > 500 ? `${refusal.slice(0, 500)}…` : refusal;
    console.error(`OpenAI vision refused to analyze image: ${loggedRefusal}`);
    throw new PalmVisionError('refusal', 'Image could not be analyzed');
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new PalmVisionError('no_content', 'No content in OpenAI response');
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;

  // Handle AI occasionally using "visibleLines" instead of "lines"
  if (!Array.isArray(parsed.lines) && Array.isArray(parsed.visibleLines)) {
    parsed.lines = parsed.visibleLines;
    delete parsed.visibleLines;
  }

  // Validate against the PalmAnalysis contract before returning. The parser
  // applies the same normalization the legacy code path did (defaults for
  // missing fields, clamping for out-of-range strength) so callers keep the
  // existing shape guarantees.
  const validation = validatePalmAnalysis(parsed);
  if (!validation.valid) {
    console.warn(`PalmAnalysis contract violations: ${validation.errors.join('; ')}`);
  }

  // Capture token usage for cost accounting (issue #31). Only forward when
  // the provider actually reports it — `null` triggers the pricing fallback.
  const usage: TokenUsage | null = data.usage
    ? {
        promptTokens: typeof data.usage.prompt_tokens === 'number' ? data.usage.prompt_tokens : 0,
        completionTokens: typeof data.usage.completion_tokens === 'number' ? data.usage.completion_tokens : 0,
        totalTokens: typeof data.usage.total_tokens === 'number'
          ? data.usage.total_tokens
          : (typeof data.usage.prompt_tokens === 'number' ? data.usage.prompt_tokens : 0) +
            (typeof data.usage.completion_tokens === 'number' ? data.usage.completion_tokens : 0),
      }
    : null;

  try {
    return { analysis: parsePalmAnalysis(parsed), usage };
  } catch (err) {
    // The parse error is propagated as a typed PalmVisionError. We deliberately
    // do NOT include the raw model output (`content`) in the message — the
    // route handler logs the error message via `console.error` and may forward
    // it to the user, so embedding the vendor response body would leak
    // AI-generated text we never want to persist or expose.
    const msg = err instanceof Error ? err.message : 'parse failed';
    throw new PalmVisionError('invalid_response', `AI response did not match PalmAnalysis contract: ${msg}`);
  }
}
