/**
 * Route-level tests for the per-reading AI cost wiring (issue #31).
 *
 * AC:
 *   [1] After successful /api/read-palm, readings.estimated_ai_cost is populated.
 *   [2] Cost computed from token usage (vision + synthesis) using current model pricing.
 *   [3] Non-blocking: cost write failure does not break the user response.
 *
 * The tests stub the D1 binding so we can inspect the `bind()` arguments
 * the route handler hands to the `INSERT INTO readings ...` statement and
 * confirm the `estimated_ai_cost` column receives the value produced by
 * `lib/pricing.computeReadingCostUsd` (not the pre-#31 flat constant).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';
import { palmRoute } from '../palm';
import {
  FALLBACK_READING_COST_USD,
  SYNTHESIS_PRICING,
  VISION_PRICING,
} from '../../lib/pricing';

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
 * A D1 stub that records every `bind(...args)` call so a test can inspect
 * the exact column values the route handed to the INSERT.
 */
function makeRecordingDB(): D1Database & { calls: Array<{ sql: string; args: unknown[] }> } {
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
    calls,
  } as unknown as D1Database & { calls: Array<{ sql: string; args: unknown[] }> };
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    KV: {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
    } as unknown as KVNamespace,
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
): Promise<Response> {
  const req = new Request('http://localhost/api/read-palm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return app.fetch(req, env);
}

const TINY_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function validAnalysisJSON(): string {
  return JSON.stringify({
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
  });
}

/** Compute the expected USD cost from token counts using the pricing module. */
function expectedCost(vision: { prompt: number; completion: number }, synth: { prompt: number; completion: number }): number {
  const visionUsd = vision.prompt * (VISION_PRICING.inputPerMTokensUsd / 1_000_000)
    + vision.completion * (VISION_PRICING.outputPerMTokensUsd / 1_000_000);
  const synthUsd = synth.prompt * (SYNTHESIS_PRICING.inputPerMTokensUsd / 1_000_000)
    + synth.completion * (SYNTHESIS_PRICING.outputPerMTokensUsd / 1_000_000);
  return visionUsd + synthUsd;
}

function findInsert(db: { calls: Array<{ sql: string; args: unknown[] }> }): { args: unknown[] } {
  const insert = db.calls.find((c) => /INSERT INTO readings/i.test(c.sql));
  if (!insert) throw new Error('No INSERT INTO readings statement was issued');
  return insert;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/read-palm — AI cost wiring (issue #31)', () => {
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

  // AC #1 + #2: readings.estimated_ai_cost is populated and computed from usage.
  it('populates readings.estimated_ai_cost with the value computed from token usage', async () => {
    const visionUsage = { prompt_tokens: 2000, completion_tokens: 800, total_tokens: 2800 };
    const synthUsage1 = { prompt_tokens: 350, completion_tokens: 200, total_tokens: 550 };
    const synthUsage2 = { prompt_tokens: 320, completion_tokens: 210, total_tokens: 530 };

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: validAnalysisJSON() } }],
          usage: visionUsage,
        }),
      )
      // synthesizeReading is called once per line (2 lines here).
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'synth heart' } }],
          usage: synthUsage1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'synth head' } }],
          usage: synthUsage2,
        }),
      );

    const db = makeRecordingDB();
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(db), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-cost-1',
    });

    expect(res.status).toBe(200);

    const insert = findInsert(db);
    // INSERT INTO readings (id, user_id, data, estimated_ai_cost, created_at) ...
    // bind order: id, user_id, data, estimated_ai_cost, created_at
    const costArg = insert.args[3] as number;
    const expected = expectedCost(
      { prompt: visionUsage.prompt_tokens, completion: visionUsage.completion_tokens },
      // Synthesis is called once per line and the costs sum.
      { prompt: synthUsage1.prompt_tokens + synthUsage2.prompt_tokens,
        completion: synthUsage1.completion_tokens + synthUsage2.completion_tokens },
    );
    expect(costArg).toBeGreaterThan(0);
    expect(costArg).toBeCloseTo(expected, 8);
    // Hard guarantee: not the pre-#31 flat constant.
    expect(costArg).not.toBe(FALLBACK_READING_COST_USD);
  });

  // AC #3: Non-blocking — when the provider omits usage data, the route
  // still returns 200 and falls back to a non-zero cost.
  it('falls back to the flat cost when providers omit usage data, and still 200s', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: validAnalysisJSON() } }] })) // no usage
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'synth heart' } }] })) // no usage
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'synth head' } }] })); // no usage

    const db = makeRecordingDB();
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(db), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-cost-fallback',
    });

    expect(res.status).toBe(200);
    const insert = findInsert(db);
    const costArg = insert.args[3] as number;
    expect(costArg).toBe(FALLBACK_READING_COST_USD);
  });

  // AC #3: Non-blocking — even if usage numbers are NaN-y garbage, the
  // route still 200s (the try/catch + fallback in the pricing module).
  it('does not 500 when the provider returns a malformed usage payload', async () => {
    // We can't actually serialize NaN in JSON, but we can return string fields
    // that will coerce to NaN inside the route, exercising the defensive path.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: validAnalysisJSON() } }],
          usage: { prompt_tokens: 'not-a-number', completion_tokens: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'synth heart' } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'synth head' } }] }));

    const db = makeRecordingDB();
    const app = buildApp();
    const res = await postReadPalm(app, makeEnv(db), {
      imageBase64: TINY_IMAGE_BASE64,
      userId: 'user-cost-malformed',
    });

    expect(res.status).toBe(200);
    const insert = findInsert(db);
    const costArg = insert.args[3] as number;
    expect(Number.isFinite(costArg)).toBe(true);
    expect(costArg).toBeGreaterThanOrEqual(0);
  });
});
