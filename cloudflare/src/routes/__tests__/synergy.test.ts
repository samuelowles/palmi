/**
 * Synergy route tests — Issue #36
 *
 * Verifies server-side pro entitlement gating on POST /api/synergy:
 *   - Free user (KV miss → DB lookup) → 402 with paywall-hint body
 *   - Free user (KV hit) → 402 with paywall-hint body, no DB lookup
 *   - Pro user → 200 with synergy result (normal flow)
 *   - KV cache write uses a 60s TTL and is best-effort (KV failure ≠ gate failure)
 *   - No requesterUserId → entitlement check is skipped (legacy mode preserved)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';
import { synergyRoute } from '../synergy';

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
 * Build a fake D1Database that routes statements by their SQL text.
 * The synergy route issues at most four statements per request:
 *   - SELECT is_pro FROM users WHERE id = ?                (only on KV miss)
 *   - SELECT user_id, data FROM readings WHERE id = ?      (×2 for A and B)
 *   - INSERT INTO synergy_results ...                      (only after a pro pass)
 */
type ReadingsRow = { user_id: string; data: string };
type UsersRow = { is_pro: number };

function buildReadingData(overrides?: { archetype?: string; emoji?: string }): string {
  return JSON.stringify({
    archetype: overrides?.archetype ?? 'The Phoenix',
    archetypeEmoji: overrides?.emoji ?? '🔥',
    lines: [{ type: 'heart', strength: 50, archetype: overrides?.archetype ?? 'The Phoenix' }],
  });
}

function makeFakeDB(opts: {
  readings?: Record<string, ReadingsRow>;
  user?: UsersRow;
  insertSucceeds?: boolean;
} = {}): {
  db: D1Database;
  userSelectCount: () => number;
  readingsSelectCount: () => number;
  insertCount: () => number;
} {
  let userSelectCount = 0;
  let readingsSelectCount = 0;
  let insertCount = 0;
  const insertSucceeds = opts.insertSucceeds ?? true;
  const statement = {
    bind: (..._params: unknown[]) => ({
      run: () => {
        const sql = (statement as unknown as { _sql?: string })._sql ?? '';
        if (/INSERT INTO synergy_results/i.test(sql)) insertCount++;
        return Promise.resolve({ success: insertSucceeds });
      },
      first: () => {
        const sql = (statement as unknown as { _sql?: string })._sql ?? '';
        if (/FROM users/i.test(sql)) {
          userSelectCount++;
          return Promise.resolve(opts.user ?? null);
        }
        if (/FROM readings/i.test(sql)) {
          readingsSelectCount++;
          // bind(_params) — the first param is the reading id
          const id = _params[0] as string;
          return Promise.resolve(opts.readings?.[id] ?? null);
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
    userSelectCount: () => userSelectCount,
    readingsSelectCount: () => readingsSelectCount,
    insertCount: () => insertCount,
  };
}

function makeEnv(opts: {
  readings?: Record<string, ReadingsRow>;
  user?: UsersRow;
  kv?: KVNamespace & { puts: PutCall[]; gets: string[] };
  failKvPut?: boolean;
} = {}): {
  env: Env;
  userSelectCount: () => number;
  readingsSelectCount: () => number;
  insertCount: () => number;
  kv: KVNamespace & { puts: PutCall[]; gets: string[] };
} {
  const { db, userSelectCount, readingsSelectCount, insertCount } = makeFakeDB({
    readings: opts.readings,
    user: opts.user,
  });
  const kv = opts.kv ?? makeFakeKV({}, opts.failKvPut ?? false);
  const env: Env = {
    DB: db,
    KV: kv,
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc',
    TURNSTILE_SECRET_KEY: 'test-turnstile',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt',
  };
  return { env, userSelectCount, readingsSelectCount, insertCount, kv };
}

const READING_ID_A = '11111111-1111-1111-1111-111111111111';
const READING_ID_B = '22222222-2222-2222-2222-222222222222';

function buildTwoReadings(): Record<string, ReadingsRow> {
  return {
    [READING_ID_A]: { user_id: 'alice', data: buildReadingData({ archetype: 'The Phoenix', emoji: '🔥' }) },
    [READING_ID_B]: { user_id: 'bob', data: buildReadingData({ archetype: 'The Warrior', emoji: '⚔️' }) },
  };
}

async function postSynergy(
  app: Hono<{ Bindings: Env }>,
  env: Env,
  body: Record<string, unknown>,
): Promise<Response> {
  const req = new Request('http://localhost/api/synergy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
  return app.fetch(req, env);
}

describe('POST /api/synergy — server-side pro entitlement gate (issue #36)', () => {
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();
    app.route('/api', synergyRoute);
  });

  it('returns 402 for a free user (KV miss → DB lookup) with paywall-hint body', async () => {
    const { env, userSelectCount, readingsSelectCount, insertCount } = makeEnv({
      readings: buildTwoReadings(),
      user: { is_pro: 0 },
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'alice',
    });

    expect(res.status).toBe(402);
    expect(userSelectCount()).toBe(1); // KV miss → DB read
    // No comparison work should have been done for a free user.
    expect(readingsSelectCount()).toBe(0);
    expect(insertCount()).toBe(0);

    const body = (await res.json()) as {
      error: string;
      code: string;
      entitlement: string;
    };
    expect(body.error).toMatch(/Pro/i);
    expect(body.code).toBe('pro_required');
    expect(body.entitlement).toBe('pro');
  });

  it('returns 402 for a free user from KV cache (no DB lookup)', async () => {
    const kv = makeFakeKV({ 'entitlement:bob': '0' }); // bob is free in cache
    const { env, userSelectCount, readingsSelectCount, insertCount } = makeEnv({
      readings: buildTwoReadings(),
      // user row would say is_pro=1 — cache must win.
      user: { is_pro: 1 },
      kv,
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'bob',
    });

    expect(res.status).toBe(402);
    expect(userSelectCount()).toBe(0); // KV hit, no DB lookup
    expect(readingsSelectCount()).toBe(0);
    expect(insertCount()).toBe(0);
  });

  it('runs the comparison and returns 200 for a pro user', async () => {
    const { env, userSelectCount, readingsSelectCount, insertCount } = makeEnv({
      readings: buildTwoReadings(),
      user: { is_pro: 1 },
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'alice',
    });

    expect(res.status).toBe(200);
    expect(userSelectCount()).toBe(1);
    expect(readingsSelectCount()).toBe(2);
    expect(insertCount()).toBe(1);

    const body = (await res.json()) as {
      score: number;
      matchLabel: string;
      personA: { archetype: string };
      personB: { archetype: string };
      insights: string[];
    };
    expect(typeof body.score).toBe('number');
    expect(body.score).toBeGreaterThanOrEqual(20);
    expect(body.score).toBeLessThanOrEqual(99);
    expect(body.matchLabel).toBeTruthy();
    expect(body.personA.archetype).toBe('The Phoenix');
    expect(body.personB.archetype).toBe('The Warrior');
    expect(Array.isArray(body.insights)).toBe(true);
  });

  it('runs the comparison for a pro user via KV cache (no DB lookup)', async () => {
    const kv = makeFakeKV({ 'entitlement:alice': '1' });
    const { env, userSelectCount, insertCount } = makeEnv({
      readings: buildTwoReadings(),
      // user row would say is_pro=0 — cache wins.
      user: { is_pro: 0 },
      kv,
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'alice',
    });

    expect(res.status).toBe(200);
    expect(userSelectCount()).toBe(0); // KV hit, no DB lookup
    expect(insertCount()).toBe(1);
  });

  it('writes the entitlement cache with a 60s TTL on miss', async () => {
    const kv = makeFakeKV();
    const { env } = makeEnv({
      readings: buildTwoReadings(),
      user: { is_pro: 1 },
      kv,
    });

    await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'alice',
    });

    const entitlementPuts = kv.puts.filter((p) => p.key.startsWith('entitlement:'));
    expect(entitlementPuts).toHaveLength(1);
    expect(entitlementPuts[0].key).toBe('entitlement:alice');
    expect(entitlementPuts[0].value).toBe('1');
    expect(entitlementPuts[0].opts?.expirationTtl).toBe(60);
  });

  it('a KV.put failure does not break the gate (best-effort cache write)', async () => {
    // Fail only the entitlement cache write — the rate limiter's own write
    // must succeed or the request never reaches the entitlement block.
    const kv = makeFakeKV({}, (key) => key.startsWith('entitlement:'));
    const { env } = makeEnv({
      readings: buildTwoReadings(),
      user: { is_pro: 1 },
      kv,
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
      userId: 'alice',
    });

    expect(res.status).toBe(200); // still 200, not 500
  });

  it('skips the entitlement gate when no requesterUserId is supplied (legacy mode)', async () => {
    // No user row — but the entitlement block must be skipped entirely.
    const { env, userSelectCount, insertCount } = makeEnv({
      readings: buildTwoReadings(),
    });

    const res = await postSynergy(app, env, {
      readingIdA: READING_ID_A,
      readingIdB: READING_ID_B,
    });

    expect(res.status).toBe(200);
    expect(userSelectCount()).toBe(0); // gate skipped
    expect(insertCount()).toBe(1);     // comparison still ran
  });
});
