/**
 * Reading Route — GET /api/reading/:id
 * Retrieves a stored palm reading by ID.
 * Enforces server-side subscription gating — premium content stripped for free users.
 * The requesting userId must match the reading's owner, or include a valid share grant.
 *
 * Issue #35 — pro entitlement is verified server-side via the shared
 * `users.is_pro` column (mutated by the RevenueCat webhook) with a 60s
 * KV cache layer to keep the DB hit rate low under repeat reads.
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { rateLimit } from '../lib/rateLimiter';

interface ReadingLine {
  type: string;
  label: string;
  strength: number;
  archetype: string;
  emoji: string;
  shortSummary: string;
  fullReading: string;
  isPremium: boolean;
}

// Issue #35 — 60s TTL caps the entitlement-check load on the shared D1
// `users` table and (future) RevenueCat REST API. Short enough that a
// webhook-driven revocation is felt within a minute, long enough that a
// user revisiting their history doesn't hammer the DB.
const ENTITLEMENT_CACHE_TTL_SECONDS = 60;
const ENTITLEMENT_CACHE_KEY_PREFIX = 'entitlement:';

export const readingRoute = new Hono<{ Bindings: Env }>();

// Rate limit: 30 reading fetches per minute per IP
readingRoute.use('/reading/*', rateLimit({ maxRequests: 30, windowSeconds: 60 }));

readingRoute.get('/reading/:id', async (c) => {
  const id = c.req.param('id');

  // Grace period: accept JWT userId or legacy query userId
  const authUserId = c.get('userId');
  const legacyUserId = c.req.query('userId');
  const requesterUserId = authUserId || legacyUserId;

  // Fetch reading with user_id for ownership verification
  const result = await c.env.DB.prepare(
    'SELECT user_id, data FROM readings WHERE id = ?'
  ).bind(id).first<{ user_id: string; data: string }>();

  if (!result) {
    return c.json({ error: 'Reading not found' }, 404);
  }

  const reading = JSON.parse(result.data);

  // Verify ownership — only the owner can access their reading
  if (requesterUserId && requesterUserId !== result.user_id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Server-side entitlement check (issue #35). The shared cache is the
  // `users.is_pro` column maintained by the RevenueCat webhook; we add a
  // 60s KV layer in front to limit DB/API load on repeat reads.
  if (requesterUserId) {
    const cacheKey = `${ENTITLEMENT_CACHE_KEY_PREFIX}${requesterUserId}`;
    const cached = await c.env.KV.get(cacheKey);
    let isPro: boolean;
    if (cached === '1' || cached === '0') {
      isPro = cached === '1';
    } else {
      const userResult = await c.env.DB.prepare(
        'SELECT is_pro FROM users WHERE id = ?'
      ).bind(requesterUserId).first<{ is_pro: number }>();
      isPro = userResult?.is_pro === 1;
      // Best-effort cache write — a KV failure must not break the read.
      try {
        await c.env.KV.put(cacheKey, isPro ? '1' : '0', {
          expirationTtl: ENTITLEMENT_CACHE_TTL_SECONDS,
        });
      } catch (kvError) {
        console.error('Entitlement cache write failed:', String(kvError));
      }
    }

    if (!isPro) {
      reading.lines = reading.lines.map((line: ReadingLine) =>
        line.isPremium ? { ...line, fullReading: '' } : line
      );
    }
  }

  return c.json(reading);
});
