/**
 * Turnstile middleware tests — Issue #17
 *
 * Verifies that /api/read-palm:
 *   - reads the Turnstile token from body field `turnstileToken`
 *   - proceeds when siteverify returns success: true
 *   - returns 403 with a safe error message when token is missing or invalid
 *   - never logs or echoes the TURNSTILE_SECRET_KEY
 *   - fails closed (403) on siteverify network error
 *   - is fully skipped (verification bypassed) when TURNSTILE_SECRET_KEY is unset
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

const noopStatement = {
  bind: () => ({
    run: () => Promise.resolve({ success: true }),
    first: () => Promise.resolve({ is_pro: 0 }),
    all: () => Promise.resolve({ results: [] }),
  }),
};

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {
      prepare: () => noopStatement,
    } as unknown as D1Database,
    KV: {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
    } as unknown as KVNamespace,
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc',
    TURNSTILE_SECRET_KEY: '0xTEST_SECRET_DO_NOT_USE_IN_PROD',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt',
    ...overrides,
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
): Promise<Response> {
  const req = new Request('http://localhost/api/read-palm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '127.0.0.1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return app.fetch(req, env);
}

const TINY_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/read-palm — Turnstile middleware (issue #17)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1) Missing token — 403 with safe message, no upstream siteverify call.
  it('rejects requests with no token before invoking siteverify', async () => {
    const env = makeEnv();
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-1',
    });

    expect(res.status).toBe(403);
    const text = await res.text();
    const body = JSON.parse(text) as { error: string };
    expect(body.error).toBe('Bot verification required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 2) Invalid token (siteverify returns success: false) → 403 + no leak.
  it('returns 403 "Bot verification failed" when siteverify returns success: false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    );

    const env = makeEnv();
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-1',
      turnstileToken: 'bogus-token',
    });

    expect(res.status).toBe(403);
    const text = await res.text();
    const body = JSON.parse(text) as { error: string };
    expect(body.error).toBe('Bot verification failed');
    expect(text).not.toContain('invalid-input-response');
    expect(text).not.toContain('error-codes');
    expect(text).not.toContain('0xTEST_SECRET_DO_NOT_USE_IN_PROD');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    const bodyParams = new URLSearchParams(init.body as string);
    expect(bodyParams.get('secret')).toBe(env.TURNSTILE_SECRET_KEY);
    expect(bodyParams.get('response')).toBe('bogus-token');
  });

  // 3) Valid token → 200 (request proceeds).
  it('proceeds past Turnstile when siteverify returns success: true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                lines: [
                  {
                    type: 'heart',
                    label: 'Heart Line',
                    strength: 50,
                    archetype: 'The Main Character',
                    emoji: '✨',
                    shortSummary: 'You feel deeply.',
                    rawAnalysis: 'Your heart line runs long and clear.',
                  },
                ],
                overallArchetype: 'The Main Character',
                overallArchetypeEmoji: '✨',
                overallSummary: 'A vibrant story.',
              }),
            },
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: 'Synthesized line text.' } }],
      }),
    );

    const env = makeEnv();
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-valid',
      turnstileToken: 'valid-token',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reading?: { id?: string } };
    expect(body.reading).toBeDefined();
    expect(body.reading?.id).toBeTruthy();
  });

  // 4) Missing env → verification SKIPPED (gated design).
  it('skips Turnstile verification entirely when TURNSTILE_SECRET_KEY is unset', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          lines: [{ type: 'heart', label: 'Heart Line', strength: 50,
                    archetype: 'The Main Character', emoji: '✨',
                    shortSummary: 'You feel deeply.', rawAnalysis: 'r.' }],
          overallArchetype: 'The Main Character', overallArchetypeEmoji: '✨',
          overallSummary: 'A vibrant story.',
        })}}],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'synth text' } }] }),
    );

    const env = makeEnv({ TURNSTILE_SECRET_KEY: '' });
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-no-secret',
    });

    expect(res.status).toBe(200);
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });

  // 4b) Missing env (undefined) → verification SKIPPED, same as empty string.
  it('skips Turnstile verification when TURNSTILE_SECRET_KEY is undefined', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          lines: [{ type: 'heart', label: 'Heart Line', strength: 50,
                    archetype: 'The Main Character', emoji: '✨',
                    shortSummary: 'You feel deeply.', rawAnalysis: 'r.' }],
          overallArchetype: 'The Main Character', overallArchetypeEmoji: '✨',
          overallSummary: 'A vibrant story.',
        })}}],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'synth text' } }] }),
    );

    const env = makeEnv({ TURNSTILE_SECRET_KEY: undefined });
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-no-secret-undefined',
    });

    expect(res.status).toBe(200);
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });

  // 5) siteverify network error → fail closed (403), no internal details leak.
  it('fails closed with 403 when siteverify throws a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    const env = makeEnv();
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-network',
      turnstileToken: 'some-token',
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Bot verification failed');
    expect(JSON.stringify(body)).not.toContain('ECONNRESET');
  });

  // 6) TURNSTILE_SECRET_KEY never echoed.
  it('never echoes the secret value in any response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        'error-codes': ['invalid-input-secret'],
      }),
    );

    const env = makeEnv({ TURNSTILE_SECRET_KEY: 'super-secret-value-xyz' });
    const app = buildApp();

    const res = await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-leak-check',
      turnstileToken: 't',
    });

    const text = await res.text();
    expect(text).not.toContain('super-secret-value-xyz');
    expect(text).not.toContain('TURNSTILE_SECRET_KEY');
    expect(text).not.toContain('invalid-input-secret');
  });

  // 7) siteverify URL contract — POST form-encoded secret + response.
  it('calls siteverify with the correct URL, method, and form-encoded body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          lines: [{ type: 'heart', label: 'Heart Line', strength: 50,
                    archetype: 'The Main Character', emoji: '✨',
                    shortSummary: 'You feel deeply.', rawAnalysis: 'r.' }],
          overallArchetype: 'The Main Character', overallArchetypeEmoji: '✨',
          overallSummary: 'A vibrant story.',
        })}}],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'synth text' } }] }),
    );

    const env = makeEnv();
    const app = buildApp();

    await postReadPalm(app, env, {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-contract',
      turnstileToken: 'token-abc',
    });

    const siteverifyCall = fetchMock.mock.calls[0];
    const [url, init] = siteverifyCall as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const params = new URLSearchParams(init.body as string);
    expect(params.get('secret')).toBe(env.TURNSTILE_SECRET_KEY);
    expect(params.get('response')).toBe('token-abc');
  });
});
