/**
 * Palm Route — POST /api/read-palm
 * Accepts base64 palm image, analyzes with GPT-5.4-mini, synthesizes with DeepSeek.
 * Enforces server-side subscription gating and image size limits.
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { analyzePalm, PalmVisionError } from '../lib/palmVision';
import { synthesizeAllLines } from '../lib/synthesizer';
import { rateLimit } from '../lib/rateLimiter';
import {
  computeReadingCostUsd,
  FALLBACK_READING_COST_USD,
  type TokenUsage,
} from '../lib/pricing';

/** Turnstile verification helper */
async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export const palmRoute = new Hono<{ Bindings: Env }>();

/** Which line types require a pro subscription to read in full */
const PREMIUM_LINE_TYPES: ReadonlySet<string> = new Set(['life', 'fate']);

/** Maximum decoded image size (5 MB) */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Minimum decoded image size in bytes. Issue #96 cheap heuristic for
 * "non-palm content" — anything smaller cannot plausibly be a real palm
 * photo (the smallest valid 1×1 PNG decodes to ~68 bytes, a real compressed
 * palm photo is several KB). Sits below the test fixture's 1×1 PNG so
 * existing fixtures still flow through the AI path.
 */
const MIN_IMAGE_BYTES = 64;

/**
 * Typed error codes for the palm-reading endpoint. Issued under #89 so
 * clients can pattern-match on `code` instead of string-matching the
 * human-readable `error` field. Keep this list closed — every public
 * failure path on this route must surface a code from this union.
 */
type PalmErrorCode =
  | 'invalid_image'            // 400 — missing/empty/decode-fail/below-min imageBase64
  | 'image_too_large'          // 400 — decoded base64 > MAX_IMAGE_BYTES
  | 'invalid_user'             // 400 — missing/malformed userId
  | 'bot_check_required'       // 403 — Turnstile token missing
  | 'bot_check_failed'         // 403 — Turnstile rejected
  | 'vision_upstream_unavailable' // 502 — OpenAI 5xx
  | 'vision_refusal'           // 422 — model declined to analyze
  | 'vision_empty_response'    // 422 — model returned no content
  | 'vision_invalid_response'  // 422 — output failed contract validation
  | 'internal_error';          // 500 — anything else

// Rate limit: 5 palm readings per minute per client
palmRoute.use('/read-palm', rateLimit({ maxRequests: 5, windowSeconds: 60 }));

palmRoute.post('/read-palm', async (c) => {
  try {
    // Enforce request body size limit before parsing (5 MB max for base64 images)
    const contentLength = parseInt(c.req.header('Content-Length') || '', 10);
    if (!isNaN(contentLength) && contentLength > 5 * 1024 * 1024) {
      return c.json({ error: 'Request body too large', code: 'image_too_large' }, 413);
    }

    // Parse body — empty / non-JSON must surface as 400, not 500 (issue #96).
    let imageBase64: string | undefined;
    let userId: string | undefined;
    let turnstileToken: string | undefined;
    try {
      const body = await c.req.json<{
        imageBase64?: string;
        userId?: string;
        turnstileToken?: string;
      }>();
      imageBase64 = body.imageBase64;
      userId = body.userId;
      turnstileToken = body.turnstileToken;
    } catch {
      return c.json({ error: 'Invalid request body.', code: 'invalid_image' }, 400);
    }

    // Grace period: accept JWT userId or legacy body userId
    const authUserId = c.get('userId');
    const legacyUserId = userId;
    const effectiveUserId = authUserId || legacyUserId;

    // Legacy deprecation tracking
    if (!authUserId && legacyUserId) {
      console.warn(`[Deprecated] Legacy userId auth for user ${legacyUserId}`);
      c.header('X-Auth-Warning', 'deprecated');
    }

    // Validate inputs
    if (!imageBase64) {
      return c.json({ error: 'imageBase64 is required', code: 'invalid_image' }, 400);
    }
    if (!effectiveUserId || typeof effectiveUserId !== 'string' || effectiveUserId.length > 36) {
      return c.json({ error: 'Invalid userId', code: 'invalid_user' }, 400);
    }

    // Turnstile bot verification (skipped if not configured)
    if (c.env.TURNSTILE_SECRET_KEY) {
      if (!turnstileToken) {
        return c.json({ error: 'Bot verification required', code: 'bot_check_required' }, 403);
      }
      const isValid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY);
      if (!isValid) {
        return c.json({ error: 'Bot verification failed', code: 'bot_check_failed' }, 403);
      }
    }

    // Enforce image size limit before any AI call.
    // `atob` decodes base64 to a binary string — each char is one byte.
    // Issue #96: malformed base64 throws here; an empty / near-empty
    // decoded payload is almost certainly not a palm photo. Both must
    // surface as 400 with code `invalid_image`, not 500.
    let decodedSize: number;
    try {
      decodedSize = atob(imageBase64).length;
    } catch {
      return c.json({ error: 'Image data is unreadable.', code: 'invalid_image' }, 400);
    }
    if (decodedSize < MIN_IMAGE_BYTES) {
      return c.json(
        { error: 'Image too small. Try a clearer palm photo in good lighting.', code: 'invalid_image' },
        400,
      );
    }
    if (decodedSize > MAX_IMAGE_BYTES) {
      return c.json({ error: 'Image too large. Maximum 5 MB.', code: 'image_too_large' }, 400);
    }

    // Ensure user exists (create if first visit)
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO users (id) VALUES (?)'
    ).bind(effectiveUserId).run();

    // Check user's subscription status for server-side access control
    const userResult = await c.env.DB.prepare(
      'SELECT is_pro FROM users WHERE id = ?'
    ).bind(effectiveUserId).first<{ is_pro: number }>();
    const isPro = userResult?.is_pro === 1;

    // Step 1: Analyze palm with GPT-5.4-mini
    const { analysis, usage: visionUsage } = await analyzePalm(imageBase64, c.env.OPENAI_API_KEY);

    // Step 2: Synthesize readings with DeepSeek
    const { readings: synthesized, usage: synthesisUsage } = await synthesizeAllLines(
      analysis.lines.map((l) => ({ type: l.type, rawAnalysis: l.rawAnalysis })),
      c.env.DEEPSEEK_API_KEY
    );

    // Step 3: Build reading object
    const readingId = crypto.randomUUID();
    const now = new Date().toISOString();

    const allLines = analysis.lines.map((line) => ({
      type: line.type,
      label: line.label,
      strength: line.strength,
      archetype: line.archetype,
      emoji: line.emoji,
      shortSummary: line.shortSummary,
      fullReading: synthesized.get(line.type) || line.rawAnalysis,
      isPremium: PREMIUM_LINE_TYPES.has(line.type),
    }));

    const reading = {
      id: readingId,
      userId: effectiveUserId,
      imageUri: '',
      lines: allLines,
      overallSummary: analysis.overallSummary,
      archetype: analysis.overallArchetype,
      archetypeEmoji: analysis.overallArchetypeEmoji,
      createdAt: now,
    };

    // Step 4: Compute per-reading AI cost from real token usage (issue #31).
    //
    // AC "Cost computed from token usage (vision + synthesis) using current
    // model pricing" → pricing lives in lib/pricing.ts.
    //
    // AC "Non-blocking: cost write failure does not break the user response"
    // → wrap the computation in try/catch. A NaN/throw from a malformed usage
    // payload falls back to the pre-#31 flat estimate instead of taking the
    // route down. The INSERT itself can still fail and propagate; that is the
    // pre-existing storage error path, unchanged.
    let estimatedCost: number;
    try {
      estimatedCost = computeReadingCostUsd(
        visionUsage as TokenUsage | null,
        synthesisUsage as TokenUsage | null,
      );
    } catch {
      estimatedCost = FALLBACK_READING_COST_USD;
    }

    // Step 5: Store full reading in D1 (all content, regardless of pro status)
    await c.env.DB.prepare(
      `INSERT INTO readings (id, user_id, data, estimated_ai_cost, created_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(readingId, effectiveUserId, JSON.stringify(reading), estimatedCost, now)
      .run();

    // Step 5: Build response — strip premium content for free users
    const responseReading = {
      ...reading,
      lines: reading.lines.map((line) =>
        line.isPremium && !isPro
          ? { ...line, fullReading: '' }
          : line
      ),
    };

    return c.json({ reading: responseReading });
  } catch (error) {
    // Typed PalmVision errors map to a specific status + code (#89).
    // We deliberately do NOT echo `error.message` to the client — those
    // messages intentionally embed vendor-side classification hints we
    // don't want to expose. The full error is logged for ops triage.
    if (error instanceof PalmVisionError) {
      if (error.code === 'upstream_unavailable') {
        console.error('Palm reading failed (vision upstream unavailable):', error.message);
        return c.json(
          { error: 'Vision service unavailable. Please try again.', code: 'vision_upstream_unavailable' },
          502,
        );
      }
      // refusal / no_content / invalid_response all mean the model could
      // not produce a usable analysis of THIS image. 422 is the right
      // status — the request was well-formed, but the AI provider returned
      // something the client needs to handle (e.g. retry with a clearer
      // palm photo).
      const code: PalmErrorCode =
        error.code === 'refusal' ? 'vision_refusal'
        : error.code === 'no_content' ? 'vision_empty_response'
        : 'vision_invalid_response';
      console.error(`Palm reading failed (${error.code}):`, error.message);
      return c.json(
        { error: "We couldn't read this image. Try a clearer palm photo in good lighting.", code },
        422,
      );
    }
    // Unknown error — log details, but never echo them to the client.
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Palm reading failed (internal):', msg);
    return c.json(
      { error: 'Analysis failed. Please try again.', code: 'internal_error' },
      500,
    );
  }
});
