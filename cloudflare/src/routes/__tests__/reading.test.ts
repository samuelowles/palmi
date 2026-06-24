/**
 * Reading route tests — Issue #35
 *
 * Verifies server-side entitlement gating on GET /api/reading/:id:
 *   - Free user → premium lines' fullReading is stripped to ""
 *   - Pro user → full reading returned (no stripping)
 *   - Entitlement is read from KV cache first; KV miss falls back to D1
 *   - KV cache write uses a 60s TTL and is best-effort (KV failure ≠ read failure)
 *   - Ownership still enforced (different userId → 403)
 *   - Reading not found → 404
 *   - No requesterUserId → entitlement check is skipped (legacy mode preserved)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';
import { readingRoute } from '../reading';

type PutCall = { key: string; value: string; opts?: { expirationTtl?: number } };

function makeFakeKV(
  initial: Record<string, string> = {},
  failPut: boolean | ((key: string) => boolean) = false
): KVNamespace & { puts: PutCall[]; gets: string[] } {
  const store = new Map<string, string>(Object.entries(initial));
  const puts: PutCall[] = [];
  const gets: string[] = [];
  const shouldFail = (key: string) =>
    typeof failPut === 'function' ? failPut(key) : failPut;
  return {
    puts,
    gets,
    get: async (key: string) => {
      gets.push(key);
      return store.get(key) ?? null;
    },
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      if (shouldFail(key)) throw new Error('KV.put failed');
      puts.push({ key, value, opts });
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace & { puts: PutCall[]; gets: string[] };
}

/**
 * Build a fake D1Database that returns the supplied rows keyed by query shape.
 * The route issues two queries per request:
 *   - SELECT user_id, data FROM readings WHERE id = ?
 *   - SELECT is_pro FROM users WHERE id = ?  (only on KV miss)
 */
type ReadingsRow = { user_id: string; data: string };
type UsersRow = { is_pro: number };
function makeFakeDB(opts: { reading?: ReadingsRow; user?: UsersRow } = {}): {
  db: D1Database;
  readsSelectCount: () => number;
  userSelectCount: () => number;
} {
  let readsSelectCount = 0;
  let userSelectCount = 0;
  const statement = {
    bind: (..._params: unknown[]) => ({
      run: () => Promise.resolve({ success: true }),
      first: () => {
        // Heuristic: the reading SELECT binds the reading id, the user
        // SELECT binds the user id. We route by the statement-level text.
        const sql = (statement as unknown as { _sql?: string })._sql ?? '';
        if (/FROM readings/i.test(sql)) {
          readsSelectCount++;
          return Promise.resolve(opts.reading ?? null);
        }
        if (/FROM users/i.test(sql)) {
          userSelectCount++;
          return Promise.resolve(opts.user ?? null);
        }
        return Promise.resolve(null);
      },
      all: () => Promise.resolve({ results: [] }),
    }),
  };
  const db = {
    prepare: (sql: string) => {
      (statement as unknown as { _sql: string })._sql = sql;
      return statement;
    },
  } as unknown as D1Database;
  return {
    db,
    readsSelectCount: () => readsSelectCount,
    userSelectCount: () => userSelectCount,
  };
}

function makeEnv(opts: {
  reading?: ReadingsRow;
  user?: UsersRow;
  kv?: KVNamespace & { puts: PutCall[]; gets: string[] };
  failKvPut?: boolean;
}): { env: Env; readsSelectCount: () => number; userSelectCount: () => number } {
  const { db, readsSelectCount, userSelectCount } = makeFakeDB({
    reading: opts.reading,
    user: opts.user,
  });
  const env: Env = {
    DB: db,
    KV: opts.kv ?? makeFakeKV(),
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc',
    TURNSTILE_SECRET_KEY: 'test-turnstile',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt',
  };
  return { env, readsSelectCount, userSelectCount };
}

function buildReadingData(): string {
  return JSON.stringify({
    id: 'r-1',
    archetype: 'The Phoenix',
    lines: [
      { type: 'heart', label: 'Heart Line', fullReading: 'loves deeply', isPremium: false },
      { type: 'life', label: 'Life Line', fullReading: 'secret life insight', isPremium: true },
    ],
  });
}

describe('GET /api/reading/:id — server-side entitlement gate (issue #35)', () => {
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();
    app.route('/', readingRoute);
  });

  it('strips premium fullReading for a free user (KV miss → DB lookup)', async () => {
    const { env, userSelectCount } = makeEnv({
      reading: { user_id: 'alice', data: buildReadingData() },
      user: { is_pro: 0 },
    });

    const res = await app.request('/reading/r-1?userId=alice', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { lines: Array<{ type: string; fullReading: string }> };
    const heart = body.lines.find((l) => l.type === 'heart')!;
    const life = body.lines.find((l) => l.type === 'life')!;
    expect(heart.fullReading).toBe('loves deeply'); // free lines untouched
    expect(life.fullReading).toBe(''); // premium stripped
    expect(userSelectCount()).toBe(1); // KV miss → DB read
  });

  it('returns the full reading for a pro user', async () => {
    const { env } = makeEnv({
      reading: { user_id: 'alice', data: buildReadingData() },
      user: { is_pro: 1 },
    });

    const res = await app.request('/reading/r-1?userId=alice', { method: 'GET' }, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { lines: Array<{ type: string; fullReading: string }> };
    const life = body.lines.find((l) => l.type === 'life')!;
    expect(life.fullReading).toBe('secret life insight'); // not stripped
  });

  it('uses the KV cache on a hit and does not query D1 users table', async () => {
    const kv = makeFakeKV({ 'entitlement:bob': '1' }); // bob is pro in cache
    const { env, userSelectCount } = makeEnv({
      reading: { user_id: 'bob', data: buildReadingData() },
      // user row would say is_pro=0 — proves cache wins
      user: { is_pro: 0 },
      kv,
    });

    const res = await app.request('/reading/r-1?userId=bob', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    expect(userSelectCount()).toBe(0); // KV hit, no DB lookup

    const body = (await res.json()) as { lines: Array<{ type: string; fullReading: string }> };
    expect(body.lines.find((l) => l.type === 'life')!.fullReading).toBe('secret life insight');
  });

  it('writes the KV cache with a 60s TTL on miss', async () => {
    const kv = makeFakeKV();
    const { env } = makeEnv({
      reading: { user_id: 'alice', data: buildReadingData() },
      user: { is_pro: 0 },
      kv,
    });

    await app.request('/reading/r-1?userId=alice', { method: 'GET' }, env);

    // The rate limiter also writes to KV; only the entitlement cache write
    // is in scope for this test.
    const entitlementPuts = kv.puts.filter((p) => p.key.startsWith('entitlement:'));
    expect(entitlementPuts).toHaveLength(1);
    expect(entitlementPuts[0].key).toBe('entitlement:alice');
    expect(entitlementPuts[0].value).toBe('0');
    expect(entitlementPuts[0].opts?.expirationTtl).toBe(60);
  });

  it('a KV.put failure does not break the read (best-effort cache write)', async () => {
    // Fail only the entitlement cache write — the rate limiter's own write
    // must succeed or the request never reaches the entitlement block.
    const kv = makeFakeKV({}, (key) => key.startsWith('entitlement:'));
    const { env } = makeEnv({
      reading: { user_id: 'alice', data: buildReadingData() },
      user: { is_pro: 0 },
      kv,
    });

    const res = await app.request('/reading/r-1?userId=alice', { method: 'GET' }, env);
    expect(res.status).toBe(200); // still 200, not 500

    const body = (await res.json()) as { lines: Array<{ type: string; fullReading: string }> };
    expect(body.lines.find((l) => l.type === 'life')!.fullReading).toBe(''); // still gated correctly
  });

  it('returns 404 when the reading does not exist', async () => {
    const { env } = makeEnv({ reading: undefined, user: { is_pro: 0 } });
    const res = await app.request('/reading/nope?userId=alice', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });

  it('returns 403 when the requester does not own the reading', async () => {
    const { env } = makeEnv({ reading: { user_id: 'alice', data: buildReadingData() } });
    const res = await app.request('/reading/r-1?userId=eve', { method: 'GET' }, env);
    expect(res.status).toBe(403);
  });

  it('skips the entitlement gate when no requesterUserId is supplied (legacy mode)', async () => {
    // No KV stored, no user row — but entitlement block must be skipped.
    const { env, userSelectCount } = makeEnv({
      reading: { user_id: 'alice', data: buildReadingData() },
    });

    const res = await app.request('/reading/r-1', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    expect(userSelectCount()).toBe(0); // gate skipped

    const body = (await res.json()) as { lines: Array<{ type: string; fullReading: string }> };
    expect(body.lines.find((l) => l.type === 'life')!.fullReading).toBe('secret life insight');
  });
});