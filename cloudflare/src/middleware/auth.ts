import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../lib/jwt';
import type { Env } from '../index';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string | undefined;
    authMode: 'jwt' | 'legacy';
  }
}

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  // Grace period: try JWT first, fall through to legacy if no header
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);

    let payload;
    try {
      payload = await verifyToken(token, c.env.JWT_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Token validation failed';
      return c.json({ error: `Invalid token: ${msg}` }, 401);
    }

    if (payload.type !== 'access') {
      return c.json({ error: 'Invalid token type' }, 401);
    }

    // KV-based active session check
    try {
      const storedUserId = await c.env.KV.get(`token:${payload.jti}`);
      if (!storedUserId || storedUserId !== payload.sub) {
        return c.json({ error: 'Token revoked or expired' }, 401);
      }
    } catch (kvError) {
      console.error('KV unavailable during auth:', String(kvError));
      return c.json({ error: 'Authentication service unavailable' }, 503);
    }

    c.set('userId', payload.sub);
    c.set('authMode', 'jwt');
  } else {
    // Grace period: legacy client-controlled userId
    c.set('authMode', 'legacy');
  }

  await next();
});
