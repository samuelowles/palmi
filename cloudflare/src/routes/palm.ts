/**
 * Palm Route — POST /api/read-palm
 * Accepts base64 palm image, analyzes with GPT-5.4-mini, synthesizes with DeepSeek.
 * Enforces server-side subscription gating and image size limits.
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { analyzePalm } from '../lib/palmVision';
import { synthesizeAllLines } from '../lib/synthesizer';
import { rateLimit } from '../lib/rateLimiter';

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

// Rate limit: 5 palm readings per minute per client
palmRoute.use('/read-palm', rateLimit({ maxRequests: 5, windowSeconds: 60 }));

palmRoute.post('/read-palm', async (c) => {
  try {
    // Enforce request body size limit before parsing (5 MB max for base64 images)
    const contentLength = parseInt(c.req.header('Content-Length') || '', 10);
    if (!isNaN(contentLength) && contentLength > 5 * 1024 * 1024) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    const { imageBase64, userId, turnstileToken } = await c.req.json<{
      imageBase64: string;
      userId: string;
      turnstileToken?: string;
    }>();

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
      return c.json({ error: 'imageBase64 is required' }, 400);
    }
    if (!effectiveUserId || typeof effectiveUserId !== 'string' || effectiveUserId.length > 36) {
      return c.json({ error: 'Invalid userId' }, 400);
    }

    // Turnstile bot verification (skipped if not configured)
    if (c.env.TURNSTILE_SECRET_KEY) {
      if (!turnstileToken) {
        return c.json({ error: 'Bot verification required' }, 403);
      }
      const isValid = await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET_KEY);
      if (!isValid) {
        return c.json({ error: 'Bot verification failed' }, 403);
      }
    }

    // Enforce image size limit before any AI call
    // atob decodes base64 to a binary string — each char is one byte
    const decodedSize = atob(imageBase64).length;
    if (decodedSize > MAX_IMAGE_BYTES) {
      return c.json({ error: 'Image too large. Maximum 5 MB.' }, 400);
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
    const analysis = await analyzePalm(imageBase64, c.env.OPENAI_API_KEY);

    // Step 2: Synthesize readings with DeepSeek
    const synthesized = await synthesizeAllLines(
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

    // Step 4: Store full reading in D1 (all content, regardless of pro status)
    const estimatedCost = 0.00248;
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Palm reading failed:', msg);
    return c.json(
      { error: msg.includes('palm') || msg.includes('lines') ? msg : 'Analysis failed. Please try again.' },
      500
    );
  }
});
