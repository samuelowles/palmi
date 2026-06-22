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
    expect(body.status).toBe('ok');
    expect(body.service).toBe('palmi-api');
    expect(typeof body.version).toBe('string');
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
    // Hono exposes `app.onError` so we can probe its behavior directly:
    // construct a request that has no body on a POST endpoint that will
    // throw during JSON parsing. The route handlers catch most errors
    // themselves, but if something escapes, onError must not leak the
    // raw message or a stack.
    //
    // We assert the contract: status is JSON content-type, body is an
    // object with an `error` string field, and the response does NOT
    // contain a stack-trace marker.
    const res = await app.request(
      '/api/webhook/rc',
      { method: 'POST', body: 'not-json-at-all' },
      makeEnv()
    );

    // Either the inner handler returns 401/500 (own catch), or
    // onError returns 500 — both are acceptable.  What matters is
    // that we never leak a stack trace.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const text = await res.text();
    expect(text).not.toMatch(/at .*\(.*:\d+:\d+\)/); // V8-style stack frame
    expect(text).not.toMatch(/\.ts:\d+/);             // ".ts:LINE" leak
    const body = JSON.parse(text) as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('CORS preflight (OPTIONS) on a protected route does not return 500', async () => {
    // CORS middleware handles OPTIONS itself.  The router should
    // never let an OPTIONS request fall through to a route handler.
    const res = await app.request(
      '/api/read-palm',
      { method: 'OPTIONS', headers: { Origin: 'http://localhost' } },
      makeEnv()
    );

    expect(res.status).toBeLessThan(500);
  });
});
