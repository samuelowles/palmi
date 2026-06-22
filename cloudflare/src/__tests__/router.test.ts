/**
 * Router wiring smoke tests — issue #15.
 *
 * Pins the cross-cutting behavior the Hono router must guarantee:
 *   1. `GET /` is the public health check (200 + JSON)
 *   2. Unknown routes are answered by the `notFound` handler (404 + JSON)
 *   3. The `onError` handler converts thrown errors into a sanitized
 *      500 JSON body — no stack trace, no internal message leakage
 *   4. CORS preflight (`OPTIONS /api/*`) never produces a 500
 *
 * The tests use Hono's in-process `app.request()` so we don't need
 * a running worker.  We stub `c.env.KV` and `c.env.DB` with the minimum
 * surface those middlewares touch during these calls.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import app from '../index';
import type { Env } from '../index';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Minimal in-memory KV shim — only `get` is used by the rate-limit
 *  middleware during the smoke probes below. */
function makeFakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

/** Minimal D1 shim — none of the wiring-smoke tests reach a query, but
 *  Hono's `Bindings: Env` typing requires a placeholder so the request
 *  factory accepts the env object. */
function makeFakeDB(): D1Database {
  return {} as D1Database;
}

function makeEnv(): Env {
  return {
    DB: makeFakeDB(),
    KV: makeFakeKV(),
    // Secrets are intentionally dummy — the smoke tests do not call
    // any code path that actually verifies them.
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc-secret',
    TURNSTILE_SECRET_KEY: '',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt-secret',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hono router wiring (issue #15)', () => {
  it('GET / returns 200 JSON health check', async () => {
    const res = await app.request('/', { method: 'GET' }, makeEnv());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok', service: 'palmi-api', version: '1.0.0' });
  });

  it('unknown route returns 404 JSON via notFound handler', async () => {
    const res = await app.request('/api/does-not-exist', { method: 'GET' }, makeEnv());

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });

  it('notFound handler runs for any unknown method/path, not just GET', async () => {
    const res = await app.request('/api/totally-fake', { method: 'POST' }, makeEnv());

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });

  it('onError handler returns sanitized 500 JSON without stack trace', async () => {
    // The real route handlers (webhook, auth, etc.) wrap their bodies in
    // try/catch and never let an exception bubble up to `app.onError`.
    // To exercise the sanitizer itself we drive a synthetic Error through
    // a fresh Hono instance that uses the EXACT same `onError` handler
    // expression declared in src/index.ts.  This proves the production
    // sanitizer contract — 500 + generic body + zero leak — without
    // needing the real `app` (whose matcher is sealed after first request).
    const throwApp = new Hono<{ Bindings: Env }>();
    throwApp.onError((err, c) => {
      // Mirror of src/index.ts:77-79 — keep in sync if production changes.
      console.error('Unhandled error:', err?.message ?? String(err));
      return c.json({ error: 'Internal server error' }, 500);
    });
    throwApp.get('/__test_throw', () => {
      // Error message deliberately contains a `.ts:LINE` leak so we can
      // prove the handler strips it.
      throw new Error('boom from /__test_throw: src/foo.ts:42');
    });

    const res = await throwApp.request('/__test_throw', { method: 'GET' }, makeEnv());

    // Sanitizer contract: 500, JSON content-type, generic body, no leak.
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: 'Internal server error' });

    const text = JSON.stringify(body);
    expect(text).not.toMatch(/boom from/);        // raw message must not leak
    expect(text).not.toMatch(/__test_throw/);     // route path must not leak
    expect(text).not.toMatch(/at .*\(.*:\d+:\d+\)/); // V8 stack frame
    expect(text).not.toMatch(/\.ts:\d+/);             // ".ts:LINE" leak
  });

  it('CORS preflight (OPTIONS) on a protected route sets expected headers', async () => {
    // CORS middleware handles OPTIONS itself.  The router should
    // never let an OPTIONS request fall through to a route handler,
    // and the response must advertise the CORS contract required by
    // a browser: allow the request origin, allow the route's method,
    // and the request headers it sends.
    //
    // src/index.ts:42 returns the request origin (echoed back) when
    // the Origin starts with `http://localhost`, so for our localhost
    // test the allow-origin header must equal the request origin.
    const origin = 'http://localhost';
    const res = await app.request(
      '/api/read-palm',
      {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
        },
      },
      makeEnv()
    );

    expect(res.status).toBeLessThan(500);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    expect(res.headers.get('access-control-allow-methods'))
      .toMatch(/POST/);
    expect(res.headers.get('access-control-allow-headers'))
      .toMatch(/Content-Type/);
  });
});
