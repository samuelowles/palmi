/**
 * KV-based rate limiter middleware for Cloudflare Workers.
 * Uses a sliding window per unique key (IP or userId) with a configurable limit.
 */

import type { Context } from 'hono';

interface RateLimitOptions {
  /** Logical key to identify the client (e.g., IP or userId) */
  key: string;
  /** Max requests allowed in the current window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Check rate limit. Returns true if the client has exceeded their limit.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  options: RateLimitOptions
): Promise<boolean> {
  const { key, maxRequests, windowSeconds } = options;

  // Use a sliding-window key: granularity is 10% of the window
  const granularity = Math.max(1, Math.floor(windowSeconds / 10));
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / granularity);

  const limitKey = `ratelimit:${key}:${windowKey}`;
  const count = await kv.get(limitKey);
  const current = parseInt(count || '0', 10);

  if (current >= maxRequests) {
    return true; // Rate limited
  }

  // Increment with short TTL (2x window for cleanup safety)
  await kv.put(limitKey, String(current + 1), {
    expirationTtl: windowSeconds * 2,
  });

  return false;
}

/**
 * Hono middleware factory for rate limiting.
 *
 * Identifies clients by their Cloudflare connecting IP only (x-user-id is NOT
 * used as a key so that attackers cannot bypass the limiter by sending
 * arbitrary header values).
 *
 * Fail-closed: if the KV namespace binding is missing the middleware returns
 * a 503 response rather than allowing unlimited access.  This trades a brief
 * outage for safety when the backing store is unavailable.
 */
export function rateLimit(options: {
  maxRequests: number;
  windowSeconds: number;
}) {
  return async (c: Context, next: () => Promise<void>) => {
    const kv = c.env.KV as KVNamespace;
    if (!kv) {
      // Fail closed — no KV binding means no rate limiting available
      return c.json({ error: 'Rate limiting unavailable' }, 503);
    }

    const clientKey =
      c.req.header('CF-Connecting-IP') ||
      'anonymous';

    const limited = await checkRateLimit(kv, {
      key: clientKey,
      maxRequests: options.maxRequests,
      windowSeconds: options.windowSeconds,
    });

    if (limited) {
      return c.json({ error: 'Too many requests. Please slow down.' }, 429);
    }

    return next();
  };
}
