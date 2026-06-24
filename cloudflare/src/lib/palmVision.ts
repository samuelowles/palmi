/**
 * Palm Vision — OpenAI GPT-5.4-mini vision integration
 * Analyzes palm photos and returns structured line data.
 *
 * The output shape is defined by the `PalmAnalysis` contract in
 * `cloudflare/src/contracts/palmAnalysis.ts`, which is the single source of
 * truth shared with the synthesis service.
 *
 * The system prompt lives in `cloudflare/src/prompts/palmVision.md` and is
 * loaded at build time via the `?raw` import suffix (no runtime FS access
 * needed in the Worker). See issue #27.
 */

import {
  parsePalmAnalysis,
  validatePalmAnalysis,
  type PalmAnalysis,
} from '../contracts/palmAnalysis';
import SYSTEM_PROMPT from '../prompts/palmVision.md?raw';
import type { TokenUsage } from './pricing';

interface OpenAIVisionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

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
  readonly code: 'upstream_unavailable' | 'invalid_response' | 'no_content';

  constructor(
    code: 'upstream_unavailable' | 'invalid_response' | 'no_content',
    message: string,
  ) {
    super(message);
    this.name = 'PalmVisionError';
    this.code = code;
  }
}

export async function analyzePalm(
  imageBase64: string,
  apiKey: string
): Promise<PalmVisionResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
  });

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
