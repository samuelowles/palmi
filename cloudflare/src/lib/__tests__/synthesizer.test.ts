/**
 * Synthesizer error-path tests — Issue #30.
 *
 * Pins the security fix that prevents DeepSeek error bodies from being
 * logged: those bodies can echo back our Authorization header / request
 * payload and leak the API key or prompt. The status code alone is logged
 * for ops triage. The thrown error message stays the user-facing
 * `'Synthesis service unavailable'`.
 *
 * Without this test, a future refactor could silently reintroduce the
 * Authorization/payload leak the diff in `synthesizer.ts` removes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { synthesizeReading } from '../synthesizer';

describe('synthesizeReading — error path (issue #30)', () => {
  let originalFetch: typeof fetch;
  let originalConsoleError: typeof console.error;
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalConsoleError = console.error;

    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    console.error = originalConsoleError;
  });

  it('does not log the raw response body, logs the status, and throws "Synthesis service unavailable"', async () => {
    // Canary string the synthesizer must NEVER forward to console.error.
    // Real DeepSeek error bodies can echo back our Authorization header or
    // request body — that's exactly the leak this test guards against.
    const LEAK_CANARY = 'LEAK_CANARY_BEARER_TOKEN_ECHO_42';
    const STATUS = 502;

    fetchMock.mockResolvedValueOnce(
      new Response(
        `upstream blew up. echo of auth: ${LEAK_CANARY}. echo of body: {"x":1}`,
        { status: STATUS, headers: { 'Content-Type': 'text/plain' } },
      ),
    );

    const promise = synthesizeReading('raw analysis', 'heart', 'sk-test-1234');

    // (c) The thrown error message stays the user-facing string.
    await expect(promise).rejects.toThrow('Synthesis service unavailable');

    // (a) The raw response body is NOT logged — the canary must never
    //     appear in any console.error call.
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(LEAK_CANARY),
    );
    // Belt-and-braces: stringify every call and grep the canary out of it.
    for (const call of consoleErrorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(LEAK_CANARY);
    }

    // (b) The status code IS logged for ops triage.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(String(STATUS)),
    );
  });
});
