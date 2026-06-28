/**
 * Typed error contract for POST /api/read-palm - Issue #89.
 *
 * Acceptance criteria:
 *   [1] All four error paths return correct status codes
 *       (400 bad image, 429 rate limit, 502 vision upstream, 422 model refusal).
 *   [2] Error bodies never leak internal details (no raw upstream errors).
 *   [3] Client surfaces typed actionable error messages - every failure
 *       carries a stable `code` field clients can pattern-match on.
 *
 * We mock OpenAI/DeepSeek with `vi.fn()` over global `fetch` and stub
 * D1/KV with minimum-surface fakes. No real network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';
import { palmRoute } from '../palm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * D1 stub: every prepared statement is recorded so tests can assert on
 * side-effects. We only need `run` / `first` to return safe defaults.
 */
function makeRecordingDB(): D1Database {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const makeStmt = (sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, args });
      return {
        run: () => Promise.resolve({ success: true }),
        first: () => Promise.resolve({ is_pro: 0 }),
        all: () => Promise.resolve({ results: [] }),
      };
    },
  });
  return {
    prepare: (sql: string) => makeStmt(sql),
  } as unknown as D1Database;
}

function makeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function makeEnv(): Env {
  return {
    DB: makeRecordingDB(),
    KV: makeKV(),
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc',
    TURNSTILE_SECRET_KEY: '',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt',
  };
}

function buildApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api', palmRoute);
  return app;
}

async function postReadPalm(
  app: Hono<{ Bindings: Env }>,
  env: Env,
  body: Record<string, unknown> | undefined,
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request('http://localhost/api/read-palm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '127.0.0.1',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return app.fetch(req, env);
}

// 1x1 transparent PNG, base64-encoded. Real OpenAI / DeepSeek are mocked
// so the only thing the image bytes are used for is the size check.
const TINY_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function validVisionResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            lines: [
              {
                type: 'heart',
                label: 'Heart Line',
                strength: 70,
                archetype: 'The Main Character',
                emoji: '✨',
                shortSummary: 'You feel deeply.',
                rawAnalysis: 'Your heart line runs long and clear.',
              },
              {
                type: 'head',
                label: 'Head Line',
                strength: 60,
                archetype: 'The Visionary',
                emoji: '🧠',
                shortSummary: 'You think fast.',
                rawAnalysis: 'Your head line is sharp.',
              },
            ],
            overallArchetype: 'The Main Character',
            overallArchetypeEmoji: '✨',
            overallSummary: 'A vibrant story.',
          }),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function validSynthesisResponse(text = 'synth heart') {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
  };
}

// ---------------------------------------------------------------------------
// 400 - bad image
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 400 typed error envelope (issue #89)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 + code:invalid_image when imageBase64 is missing', async () => {
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), { userId: 'u-1' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('invalid_image');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 + code:invalid_user when userId is missing', async () => {
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), { imageBase64: TINY_IMAGE_BASE64 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('invalid_user');
  });

  it('returns 400 + code:image_too_large when decoded image exceeds 5 MB', async () => {
    const app = buildApp();
    // 7 MB of base64 chars A. base64 decodes at 4 chars -> 3 bytes, so
    // 7 MB of chars decodes to ~5.25 MB, well past the 5 MB cap.
    const oversized = 'A'.repeat(7 * 1024 * 1024);
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: oversized,
      userId: 'u-1',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('image_too_large');
  });
});

// ---------------------------------------------------------------------------
// 429 - rate limit
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 429 typed error envelope (issue #89)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    // We need to mock the underlying handler so 5 successful calls can be
    // counted against the rate-limit budget. The fetch mock returns a
    // minimal valid vision response followed by minimal synthesis responses.
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          lines: [{ type: 'heart', label: 'Heart Line', strength: 70,
                     archetype: 'The Phoenix', emoji: '✨',
                     shortSummary: 'Big love.', rawAnalysis: 'You love hard.' }],
          overallArchetype: 'The Phoenix',
          overallArchetypeEmoji: '✨',
          overallSummary: 'A vibrant story.',
        }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 429 + code:rate_limited after the per-IP budget is exhausted', async () => {
    const app = buildApp();
    const env = makeEnv();
    for (let i = 0; i < 5; i++) {
      const res = await postReadPalm(app, env, {
        imageBase64: TINY_IMAGE_BASE64,
        userId: 'u-1',
      });
      expect(res.status).toBe(200);
    }
    const sixth = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as { error: string; code: string };
    expect(body.code).toBe('rate_limited');
    expect(body.error.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 502 - vision upstream 5xx
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 502 vision upstream unavailable (issue #89)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 502 + code:vision_upstream_unavailable when OpenAI returns 5xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('upstream blew up - this text must not leak', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('vision_upstream_unavailable');
    // The raw upstream body must never leak.
    expect(body.error).not.toMatch(/upstream blew up/);
    expect(body.error).not.toMatch(/this text must not leak/);
  });

  it('returns 502 + code:vision_upstream_unavailable on a 503 from OpenAI', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('service unavailable', { status: 503 }),
    );
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('vision_upstream_unavailable');
  });
});

// ---------------------------------------------------------------------------
// 422 - vision model refusal / no content / invalid response
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 422 vision refusal / bad model output (issue #89)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 422 + code:vision_refusal when OpenAI returns a refusal message', async () => {
    // Canary string that MUST NOT appear anywhere in the response body.
    // Real OpenAI refusal text can hint at internal classification rules.
    const REFUSAL_CANARY = 'REFUSAL_CANARY_POLICY_LEAK_99';
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              refusal: REFUSAL_CANARY,
            },
          },
        ],
      }),
    );

    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('vision_refusal');
    // The canary must never appear in any field.
    expect(JSON.stringify(body)).not.toContain(REFUSAL_CANARY);
    expect(body.error).not.toContain(REFUSAL_CANARY);
    // The user-facing message should be actionable.
    expect(body.error.toLowerCase()).toMatch(/image|photo|lighting/);
  });

  it('returns 422 + code:vision_empty_response when the model returns no content and no refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: {} }] }),
    );
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('vision_empty_response');
  });

  it('returns 422 + code:vision_invalid_response when the model output fails contract validation', async () => {
    // JSON parses, but it does not satisfy the PalmAnalysis contract (no
    // `lines` array at all -> parsePalmAnalysis throws).
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                totally: 'wrong',
                shape: 42,
              }),
            },
          },
        ],
      }),
    );
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('vision_invalid_response');
    // Internal validation text must not leak into the body.
    expect(body.error).not.toMatch(/parse failed/i);
    expect(body.error).not.toMatch(/PalmAnalysis/);
    expect(body.error).not.toMatch(/totally/);
    expect(body.error).not.toMatch(/shape/);
  });
});

// ---------------------------------------------------------------------------
// 500 - fallback for unknown errors
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 500 internal_error fallback (issue #89)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 500 + code:internal_error when an unknown error is thrown, without leaking the message', async () => {
    // Fetch throws something the route does not have a typed handler for.
    // The catch block must log the detail but emit a generic body.
    globalThis.fetch = (async () => {
      throw new Error('SECRET_INTERNAL_STACKTRACE_db_password=hunter2');
    }) as unknown as typeof fetch;

    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('internal_error');
    // The internal error text must not be echoed in the body.
    expect(body.error).not.toMatch(/SECRET_INTERNAL_STACKTRACE/);
    expect(body.error).not.toMatch(/hunter2/);
    expect(body.error).not.toMatch(/db_password/);
  });
});

// ---------------------------------------------------------------------------
// 200 - sanity: the success path still works and we did not regress it
// ---------------------------------------------------------------------------

describe('POST /api/read-palm - 200 success path still works (issue #89 regression)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 200 + reading when both vision and synthesis succeed', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(validVisionResponse()))
      .mockResolvedValueOnce(jsonResponse(validSynthesisResponse('synth-heart')))
      .mockResolvedValueOnce(jsonResponse(validSynthesisResponse('synth-head')));

    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'u-1',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reading: { lines: unknown[] } };
    expect(Array.isArray(body.reading.lines)).toBe(true);
  });
});
