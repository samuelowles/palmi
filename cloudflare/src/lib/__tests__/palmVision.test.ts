/**
 * Lib-level abort/error mapping for analyzePalm — Issue #98.
 *
 * The route's 502 mapping for upstream_unavailable ultimately relies on
 * `analyzePalm` translating an AbortSignal-induced AbortError into a
 * typed `PalmVisionError('upstream_unavailable', ...)`. These tests pin
 * that contract independently of the route handler so a refactor in
 * palmVision.ts cannot silently regress the route's 502 path.
 *
 * Other (non-Abort) fetch failures must propagate unchanged so the route's
 * outer catch can still classify them as 500 / internal_error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzePalm, PalmVisionError } from '../palmVision';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid PalmAnalysis-shaped body the parse layer will accept. */
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
            ],
            overallArchetype: 'The Main Character',
            overallArchetypeEmoji: '✨',
            overallSummary: 'A vibrant story.',
          }),
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

// ---------------------------------------------------------------------------
// AbortError → upstream_unavailable
// ---------------------------------------------------------------------------

describe('analyzePalm — abort mapping (issue #98)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws PalmVisionError("upstream_unavailable") when fetch rejects with an AbortError', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error('no signal'));
          return;
        }
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    // Use a tiny timeout so AbortSignal.timeout() fires quickly.
    let pve: PalmVisionError | undefined;
    try {
      await analyzePalm('irrelevant-base64', 'sk-test-1234', 10);
    } catch (err) {
      expect(err).toBeInstanceOf(PalmVisionError);
      pve = err as PalmVisionError;
    }
    expect(pve).toBeDefined();
    expect(pve!.code).toBe('upstream_unavailable');
    // The thrown message must NOT leak the abort reason — the route
    // forwards this message to console.error, and the abort string can
    // include vendor-side timing internals.
    expect(pve!.message.toLowerCase()).not.toContain('abort');
    expect(pve!.message).not.toMatch(/AbortError/);
  });

  it('re-throws non-Abort fetch errors so the route can map them to 500 / internal_error', async () => {
    // A non-AbortError throw (e.g. DNS, connection reset, custom shim
    // throwing a plain Error) must NOT be wrapped as upstream_unavailable.
    // The route's outer catch treats anything that isn't a typed
    // PalmVisionError as internal_error → 500.
    const networkFailure = new Error('ECONNRESET from upstream');
    fetchMock.mockImplementation(async () => {
      throw networkFailure;
    });

    // Confirm it really is the original Error instance — no wrapping.
    let caught: unknown;
    try {
      await analyzePalm('irrelevant-base64', 'sk-test-1234', 10_000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(networkFailure);
    expect(caught).not.toBeInstanceOf(PalmVisionError);
  });

  it('still returns a normal PalmVisionResult on a 200 response (no false-positive abort mapping)', async () => {
    // Regression guard: the AbortSignal branch must not fire on a happy
    // path. A successful 200 response should still flow through the
    // normal parse/validate pipeline and return a structured result.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validVisionResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await analyzePalm('irrelevant-base64', 'sk-test-1234', 10_000);
    expect(result.analysis.lines.length).toBe(1);
    expect(result.analysis.lines[0].type).toBe('heart');
  });
});

// ---------------------------------------------------------------------------
// Refusal → typed error + server-side log (issue #99)
// ---------------------------------------------------------------------------

describe('analyzePalm — refusal mapping (issue #99)', () => {
  let originalFetch: typeof fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
  });

  it('throws PalmVisionError("refusal") and logs the original refusal reason server-side, without leaking it in the thrown message', async () => {
    // Issue #99: the route maps the typed `refusal` code to 422 +
    // code:vision_refusal and emits a generic client message. The
    // original refusal reason must reach console.error for ops triage,
    // but it must NOT be embedded in the thrown error — the route logs
    // the error message via console.error and the privacy boundary
    // forbids forwarding the refusal text to the client.
    const REFUSAL_CANARY = 'REFUSAL_CANARY_POLICY_LEAK_99';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                refusal: REFUSAL_CANARY,
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let pve: PalmVisionError | undefined;
    try {
      await analyzePalm('irrelevant-base64', 'sk-test-1234', 10_000);
    } catch (err) {
      expect(err).toBeInstanceOf(PalmVisionError);
      pve = err as PalmVisionError;
    }
    expect(pve).toBeDefined();
    expect(pve!.code).toBe('refusal');
    // The thrown message must stay generic — never include the refusal
    // text. The route handler logs the message via console.error and
    // may surface parts of it in error envelopes.
    expect(pve!.message).not.toContain(REFUSAL_CANARY);
    // The original refusal reason must be logged for ops triage.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(REFUSAL_CANARY),
    );
  });
});
