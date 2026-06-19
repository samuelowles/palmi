import { Hono } from 'hono';
import type { Env } from '../index';
import { signToken, verifyToken } from '../lib/jwt';

export const authRoute = new Hono<{ Bindings: Env }>();

// Rate limit: 20 registrations per IP per hour
authRoute.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json<{ userId?: string }>();
    const userId = body.userId || crypto.randomUUID();

    if (body.userId && (typeof body.userId !== 'string' || body.userId.length > 36)) {
      return c.json({ error: 'Invalid userId' }, 400);
    }

    // Create or update user
    await c.env.DB.prepare(
      `INSERT INTO users (id, auth_version, last_auth_at) VALUES (?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET auth_version = auth_version + 1, last_auth_at = ?`
    ).bind(userId, new Date().toISOString(), new Date().toISOString()).run();

    // Issue tokens
    const accessResult = await signToken(userId, 'access', c.env.JWT_SECRET);
    const refreshResult = await signToken(userId, 'refresh', c.env.JWT_SECRET);

    // Store in KV
    await Promise.all([
      c.env.KV.put(`token:${accessResult.jti}`, userId, { expirationTtl: 7 * 24 * 60 * 60 }),
      c.env.KV.put(`refresh:${refreshResult.jti}`, userId, { expirationTtl: 14 * 24 * 60 * 60 }),
    ]);

    return c.json({
      token: accessResult.token,
      refreshToken: refreshResult.token,
      expiresAt: accessResult.expiresAt.toISOString(),
      userId,
    });
  } catch (error) {
    console.error('Registration failed:', String(error));
    return c.json({ error: 'Registration temporarily unavailable' }, 503);
  }
});

// Rate limit: 10 refreshes per minute per IP
authRoute.post('/auth/refresh', async (c) => {
  try {
    const { refreshToken } = await c.req.json<{ refreshToken: string }>();
    if (!refreshToken) {
      return c.json({ error: 'refreshToken is required' }, 400);
    }

    // Verify refresh token
    let payload;
    try {
      payload = await verifyToken(refreshToken, c.env.JWT_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Token validation failed';
      return c.json({ error: `Invalid token: ${msg}` }, 401);
    }

    if (payload.type !== 'refresh') {
      return c.json({ error: 'Invalid token type' }, 401);
    }

    // KV check
    const storedUserId = await c.env.KV.get(`refresh:${payload.jti}`);
    if (!storedUserId || storedUserId !== payload.sub) {
      return c.json({ error: 'Token revoked or expired' }, 401);
    }

    const userId = payload.sub;

    // Delete old tokens from KV
    await Promise.all([
      c.env.KV.delete(`token:${payload.jti}`).catch(() => {}),
      c.env.KV.delete(`refresh:${payload.jti}`).catch(() => {}),
    ]);

    // Issue new tokens (rotating refresh)
    const accessResult = await signToken(userId, 'access', c.env.JWT_SECRET);
    const newRefreshResult = await signToken(userId, 'refresh', c.env.JWT_SECRET);

    await Promise.all([
      c.env.KV.put(`token:${accessResult.jti}`, userId, { expirationTtl: 7 * 24 * 60 * 60 }),
      c.env.KV.put(`refresh:${newRefreshResult.jti}`, userId, { expirationTtl: 14 * 24 * 60 * 60 }),
    ]);

    // Update last_auth_at
    await c.env.DB.prepare(
      'UPDATE users SET last_auth_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), userId).run();

    return c.json({
      token: accessResult.token,
      refreshToken: newRefreshResult.token,
      expiresAt: accessResult.expiresAt.toISOString(),
      userId,
    });
  } catch (error) {
    console.error('Token refresh failed:', String(error));
    return c.json({ error: 'Authentication service unavailable' }, 503);
  }
});
