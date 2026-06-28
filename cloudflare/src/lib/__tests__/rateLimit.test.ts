/**
 * Unit tests for the KV-backed rate limiter middleware.
 *
 * Issue #16 acceptance criteria covered:
 *   1. Middleware applied to /api/read-palm and /api/synergy
 *      (route-level wiring is asserted in src/routes/* and src/index.ts;
 *       here we focus on the middleware semantics at the 5/60 boundary.)
 *   2. 6th request within 60s from same IP returns 429
 *   3. KV keys auto-expire after 60s (TTL set to windowSeconds on put)
 *   4. Successful (2xx) responses counted; failed (4xx/5xx) responses
 *      do not consume budget
 *
 * Tests use a vitest-friendly in-memory KV mock — no Wrangler login required.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  rateLimit,
  checkRateLimit,
  refundRateLimit,
} from '../rateLimiter';

// ---------------------------------------------------------------------------
// In-memory KV mock
// ---------------------------------------------------------------------------

interface KVPutCall {
  key: string;
  value: string;
  options?: { expirationTtl?: number };
}

function createMockKV() {
  const store = new Map<string, string>();
  const puts: KVPutCall[] = [];
  return {
    store,
    puts,
    async get(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number }
    ): Promise<void> {
      puts.push({ key, value, options });
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

type KV = ReturnType<typeof createMockKV>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestEnv {
  KV: KVNamespace;
}

function buildApp(handlerStatus: 200 | 400 | 500 = 200) {
  const app = new Hono<{ Bindings: TestEnv }>();
  app.use('/api/read-palm', rateLimit({ maxRequests: 5, windowSeconds: 60 }));
  app.post('/api/read-palm', (c) => c.json({ ok: true }, handlerStatus));
  return app;
}

async function postReadPalm(
  app: Hono<{ Bindings: TestEnv }>,
  env: TestEnv,
  ip: string
): Promise<Response> {
  const req = new Request('http://localhost/api/read-palm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify({}),
  });
  return app.fetch(req, env);
}

// ---------------------------------------------------------------------------
// Acceptance #2: 1st-5th requests pass, 6th returns 429
// ---------------------------------------------------------------------------

describe('rateLimit middleware — 5/60 boundary', () => {
  it('allows the 1st through 5th request from the same IP', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(200);

    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '1.2.3.4');
      expect(res.status, `request #${i} should be 200`).toBe(200);
    }
  });

  it('returns 429 on the 6th request from the same IP within the window', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(200);

    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '1.2.3.4');
      expect(res.status).toBe(200);
    }
    const sixth = await postReadPalm(app, env, '1.2.3.4');
    expect(sixth.status).toBe(429);
  });

  // Issue #97 acceptance #2 — Retry-After hint, and #3 — no internal KV
  // key details leak in the 429 body or headers.
  it('includes a Retry-After hint and never leaks KV key details on 429', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(200);

    for (let i = 1; i <= 5; i++) {
      await postReadPalm(app, env, '5.5.5.5');
    }
    const sixth = await postReadPalm(app, env, '5.5.5.5');
    expect(sixth.status).toBe(429);

    // Retry-After must be present and a positive integer of seconds.
    const retryAfter = sixth.headers.get('Retry-After');
    expect(retryAfter, 'Retry-After header is required').not.toBeNull();
    expect(Number.isFinite(Number(retryAfter))).toBe(true);
    expect(Number(retryAfter)).toBeGreaterThan(0);

    // The body must not expose any KV key shape (`ratelimit:...:...`).
    const bodyText = await sixth.text();
    expect(bodyText).not.toMatch(/ratelimit:/);
    expect(bodyText).not.toMatch(/5\.5\.5\.5:\d+/);
    // Standard 429 envelope fields only.
    const body = JSON.parse(bodyText) as { code?: string; error?: string };
    expect(body.code).toBe('rate_limited');
    expect(typeof body.error).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
  });

  it('tracks each request independently — different IPs get separate budgets', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(200);

    // IP A consumes its full budget
    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '10.0.0.1');
      expect(res.status).toBe(200);
    }
    const aBlocked = await postReadPalm(app, env, '10.0.0.1');
    expect(aBlocked.status).toBe(429);

    // IP B is unaffected
    for (let i = 1; i <= 3; i++) {
      const res = await postReadPalm(app, env, '10.0.0.2');
      expect(res.status, `IP B request #${i} should pass`).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance #3: KV key auto-expires (TTL = windowSeconds)
// ---------------------------------------------------------------------------

describe('rateLimit middleware — KV TTL', () => {
  it('sets expirationTtl equal to windowSeconds on every increment', async () => {
    const kv = createMockKV();
    const env: TestEnv = { KV: kv as unknown as KVNamespace };
    const app = buildApp(200);

    await postReadPalm(app, env, '5.6.7.8');

    const incrementPuts = kv.puts.filter((p) =>
      p.key.startsWith('ratelimit:5.6.7.8:')
    );
    expect(incrementPuts.length).toBeGreaterThan(0);
    for (const put of incrementPuts) {
      expect(put.options?.expirationTtl).toBe(60);
    }
  });

  it('checkRateLimit writes the same TTL when incrementing', async () => {
    const kv = createMockKV();
    await checkRateLimit(kv as unknown as KVNamespace, {
      key: 'k',
      maxRequests: 5,
      windowSeconds: 60,
    });
    expect(kv.puts.at(-1)?.options?.expirationTtl).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Acceptance #4: 4xx/5xx responses do not consume budget
// ---------------------------------------------------------------------------

describe('rateLimit middleware — failed responses refund budget', () => {
  it('a 4xx response refunds the budget slot', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(400);

    // Fire 5 requests — all 400 — and confirm none of them consume budget.
    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '9.9.9.9');
      expect(res.status).toBe(400);
    }

    // A 6th request should still be 400 (handler always returns 400),
    // not 429. If the budget had been consumed we would see 429 instead.
    const sixth = await postReadPalm(app, env, '9.9.9.9');
    expect(sixth.status).toBe(400);
  });

  it('a 5xx response refunds the budget slot', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(500);

    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '7.7.7.7');
      expect(res.status).toBe(500);
    }
    // 6th request still 500 (handler always errors), not 429
    const sixth = await postReadPalm(app, env, '7.7.7.7');
    expect(sixth.status).toBe(500);
  });

  it('a 2xx response DOES consume the budget', async () => {
    const kv = createMockKV() as unknown as KVNamespace;
    const env: TestEnv = { KV: kv };
    const app = buildApp(200);

    for (let i = 1; i <= 5; i++) {
      const res = await postReadPalm(app, env, '8.8.8.8');
      expect(res.status).toBe(200);
    }
    const sixth = await postReadPalm(app, env, '8.8.8.8');
    expect(sixth.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// refundRateLimit: direct unit test
// ---------------------------------------------------------------------------

describe('refundRateLimit', () => {
  it('decrements the counter and writes back with TTL = windowSeconds', async () => {
    const kv = createMockKV();
    // Seed counter at 3 in the current window bucket.
    const granularity = 6;
    const now = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(now / granularity);
    const limitKey = `ratelimit:refund-test:${windowKey}`;
    kv.store.set(limitKey, '3');

    await refundRateLimit(kv as unknown as KVNamespace, {
      key: 'refund-test',
      maxRequests: 5,
      windowSeconds: 60,
      windowKey,
    });

    expect(kv.store.get(limitKey)).toBe('2');
    const put = kv.puts.at(-1);
    expect(put?.options?.expirationTtl).toBe(60);
  });

  it('is a no-op when the counter is already 0', async () => {
    const kv = createMockKV();
    const now = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(now / 6);
    await refundRateLimit(kv as unknown as KVNamespace, {
      key: 'never-charged',
      maxRequests: 5,
      windowSeconds: 60,
      windowKey,
    });
    // No writes should have happened
    expect(kv.puts.length).toBe(0);
  });

  it('targets the original windowKey even when the current clock is in a different bucket (boundary rollover)', async () => {
    // Simulates an AI handler that took >1 granularity to respond, rolling
    // the clock over into the next bucket. The refund must still decrement
    // the bucket that was charged, NOT the current bucket.
    const kv = createMockKV();
    const granularity = 6;
    const originalWindowKey = 1000;
    const currentWindowKey = originalWindowKey + 5; // current clock is in a later bucket
    const limitKey = `ratelimit:rollover-test:${originalWindowKey}`;
    const wrongKey = `ratelimit:rollover-test:${currentWindowKey}`;
    kv.store.set(limitKey, '4');
    kv.store.set(wrongKey, '2');

    await refundRateLimit(kv as unknown as KVNamespace, {
      key: 'rollover-test',
      maxRequests: 5,
      windowSeconds: 60,
      windowKey: originalWindowKey,
    });

    expect(kv.store.get(limitKey)).toBe('3');
    // The "current" bucket was NOT touched
    expect(kv.store.get(wrongKey)).toBe('2');
  });
});
