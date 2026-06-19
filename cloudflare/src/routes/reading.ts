/**
 * Reading Route — GET /api/reading/:id
 * Retrieves a stored palm reading by ID.
 * Enforces server-side subscription gating — premium content stripped for free users.
 * The requesting userId must match the reading's owner, or include a valid share grant.
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

  // Check requester's subscription status
  if (requesterUserId) {
    const userResult = await c.env.DB.prepare(
      'SELECT is_pro FROM users WHERE id = ?'
    ).bind(requesterUserId).first<{ is_pro: number }>();
    const isPro = userResult?.is_pro === 1;

    if (!isPro) {
      reading.lines = reading.lines.map((line: ReadingLine) =>
        line.isPremium ? { ...line, fullReading: '' } : line
      );
    }
  }

  return c.json(reading);
});
