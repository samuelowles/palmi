import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware } from '../middleware/auth';

export const privacyRoute = new Hono<{ Bindings: Env }>();

// Both endpoints require auth
privacyRoute.use('/privacy/*', authMiddleware);

// POST /api/privacy/export — return all user data
privacyRoute.post('/privacy/export', async (c) => {
  const userId = c.get('userId');

  // Fetch all user data
  const [userRow, readingsResult, synergyResult, analyticsResult] = await Promise.all([
    c.env.DB.prepare('SELECT id, is_pro, acquisition_source, created_at FROM users WHERE id = ?')
      .bind(userId).first(),
    c.env.DB.prepare('SELECT id, data, created_at FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(userId).all(),
    c.env.DB.prepare(
      'SELECT sr.id, sr.reading_id_a, sr.reading_id_b, sr.score, sr.match_label, sr.data, sr.created_at FROM synergy_results sr INNER JOIN readings r ON (sr.reading_id_a = r.id OR sr.reading_id_b = r.id) WHERE r.user_id = ? ORDER BY sr.created_at DESC LIMIT 100'
    ).bind(userId).all(),
    c.env.DB.prepare('SELECT event, properties, created_at FROM analytics_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000')
      .bind(userId).all(),
  ]);

  return c.json({
    user: userRow,
    readings: readingsResult.results,
    synergy: synergyResult.results,
    analyticsEvents: analyticsResult.results,
    exportedAt: new Date().toISOString(),
  });
});

// POST /api/privacy/delete — wipe all user data
privacyRoute.post('/privacy/delete', async (c) => {
  const userId = c.get('userId');

  // Delete all user data
  await Promise.all([
    c.env.DB.prepare('DELETE FROM readings WHERE user_id = ?').bind(userId).run(),
    c.env.DB.prepare('DELETE FROM synergy_results WHERE reading_id_a IN (SELECT id FROM readings WHERE user_id = ?) OR reading_id_b IN (SELECT id FROM readings WHERE user_id = ?)').bind(userId, userId).run(),
    c.env.DB.prepare('DELETE FROM analytics_events WHERE user_id = ?').bind(userId).run(),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run(),
  ]);

  // Also clean up any KV tokens for this user
  // (We can't scan KV by value, but tokens will expire naturally via TTL)

  return c.json({
    status: 'deleted',
    userId,
    deletedAt: new Date().toISOString(),
  });
});
