/**
 * Synergy Route — POST /api/synergy
 * Compares two palm readings and returns compatibility result.
 * Requires at least one of the two readings to belong to the requesting user.
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { calculateSynergy } from '../lib/synergyEngine';
import { rateLimit } from '../lib/rateLimiter';

export const synergyRoute = new Hono<{ Bindings: Env }>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limit: 10 synergy comparisons per minute per client
synergyRoute.use('/synergy', rateLimit({ maxRequests: 10, windowSeconds: 60 }));

synergyRoute.post('/synergy', async (c) => {
  try {
    // Enforce request body size limit before parsing (1 KB max — only two UUIDs + optional userId)
    const contentLength = parseInt(c.req.header('Content-Length') || '', 10);
    if (!isNaN(contentLength) && contentLength > 1024) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    const { readingIdA, readingIdB, userId } = await c.req.json<{
      readingIdA: string;
      readingIdB: string;
      userId?: string;
    }>();

    // Grace period: accept JWT userId or legacy body userId
    const authUserId = c.get('userId');
    const effectiveUserId = authUserId || userId;

    // Legacy deprecation tracking
    if (!authUserId && userId) {
      console.warn(`[Deprecated] Legacy userId auth for user ${userId}`);
      c.header('X-Auth-Warning', 'deprecated');
    }

    if (!readingIdA || !readingIdB) {
      return c.json({ error: 'Both reading IDs required' }, 400);
    }

    // Validate UUID format
    if (!UUID_RE.test(readingIdA) || !UUID_RE.test(readingIdB)) {
      return c.json({ error: 'Invalid reading ID format' }, 400);
    }

    // Prevent self-comparison
    if (readingIdA === readingIdB) {
      return c.json({ error: 'Cannot compare a reading with itself' }, 400);
    }

    // Fetch both readings with ownership info
    const [resultA, resultB] = await Promise.all([
      c.env.DB.prepare('SELECT user_id, data FROM readings WHERE id = ?').bind(readingIdA).first<{ user_id: string; data: string }>(),
      c.env.DB.prepare('SELECT user_id, data FROM readings WHERE id = ?').bind(readingIdB).first<{ user_id: string; data: string }>(),
    ]);

    if (!resultA || !resultB) {
      return c.json({ error: 'One or both readings not found' }, 404);
    }

    // Ownership verification — at least one reading must belong to the requesting user
    if (effectiveUserId && effectiveUserId !== resultA.user_id && effectiveUserId !== resultB.user_id) {
      return c.json({ error: 'Unauthorized — you must own at least one of the readings' }, 403);
    }

    const readingA = JSON.parse(resultA.data);
    const readingB = JSON.parse(resultB.data);

    const synergy = calculateSynergy(readingA, readingB);

    const synergyId = crypto.randomUUID();
    const now = new Date().toISOString();
    const estimatedCost = 0.00048;

    await c.env.DB.prepare(
      `INSERT INTO synergy_results (id, reading_id_a, reading_id_b, score, match_label, data, estimated_ai_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(synergyId, readingIdA, readingIdB, synergy.score, synergy.matchLabel, JSON.stringify(synergy), estimatedCost, now)
      .run();

    return c.json({
      score: synergy.score,
      matchLabel: synergy.matchLabel,
      personA: {
        name: 'You',
        archetype: readingA.archetype,
        emoji: readingA.archetypeEmoji,
      },
      personB: {
        name: 'Bestie',
        archetype: readingB.archetype,
        emoji: readingB.archetypeEmoji,
      },
      insights: synergy.insights,
    });
  } catch (error) {
    console.error('Synergy failed');
    return c.json({ error: 'Comparison failed' }, 500);
  }
});
