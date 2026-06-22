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

  // Increment with TTL equal to the window so the counter auto-resets
  // (issue #16 / PRD §5.2: keys must auto-expire after 60s).
  await kv.put(limitKey, String(current + 1), {
    expirationTtl: windowSeconds,
  });

  return false;
}

/**
 * Refund a previously-charged slot back to the budget. Used by the Hono
 * middleware when the downstream handler returns a 4xx/5xx — failed requests
 * must not consume the client's rate-limit budget (issue #16 acceptance #4).
 *
 * The KV key is recomputed the same way as `checkRateLimit` so the refund
 * targets the exact window the request was charged against. If the value
 * has already expired (TTL elapsed) the put is a no-op.
 */
export async function refundRateLimit(
  kv: KVNamespace,
  options: RateLimitOptions
): Promise<void> {
  const { key, windowSeconds } = options;
  const granularity = Math.max(1, Math.floor(windowSeconds / 10));
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / granularity);
  const limitKey = `ratelimit:${key}:${windowKey}`;

  const count = await kv.get(limitKey);
  const current = parseInt(count || '0', 10);
  if (current <= 0) return;

  await kv.put(limitKey, String(current - 1), {
    expirationTtl: windowSeconds,
  });
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

    // Run downstream handler, then refund the budget slot if the response
    // was a 4xx/5xx. issue #16 acceptance #4: only successful (2xx)
    // responses should consume the per-IP budget.
    await next();

    const status = c.res?.status ?? 0;
    if (status >= 400) {
      await refundRateLimit(kv, {
        key: clientKey,
        maxRequests: options.maxRequests,
        windowSeconds: options.windowSeconds,
      });
    }
  };
}
