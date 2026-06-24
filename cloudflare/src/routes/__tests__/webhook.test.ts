/**
 * RevenueCat webhook route tests - Issue #90 + Issue #91
 *   - #100: signature verification (Authorization: Bearer <secret>)
 *   - #101: idempotency / replay rejection (KV dedupe by event.id)
 *   - #102: state transition mapping (INITIAL_PURCHASE / RENEWAL /
 *          CANCELLATION / EXPIRATION → D1 user updates)
 *   - #103: lifecycle unit tests (full purchase → renew → cancel → expire)
 *
 * Acceptance criteria covered:
 *   - Signature verified on every webhook call (#100)
 *   - Replay attacks are rejected (#101)
 *   - Idempotent: same event id processed once (#101)
 *   - KV TTL >= 7 days (#101)
 *   - INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION handled (#102)
 *   - Full state machine lifecycle covered (#103)
 *
 * The tests stub D1 + KV so no live Cloudflare bindings are needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';
import { webhookRoute } from '../webhook';

type PutCall = { key: string; value: string; opts?: { expirationTtl?: number } };
function makeFakeKV(): KVNamespace & { puts: PutCall[] } {
  const store = new Map<string, string>();
  const puts: PutCall[] = [];
  return {
    puts,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      puts.push({ key, value, opts });
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace & { puts: PutCall[] };
}

const noopStatement = {
  bind: () => ({
    run: () => Promise.resolve({ success: true }),
    first: () => Promise.resolve({ is_pro: 0 }),
    all: () => Promise.resolve({ results: [] }),
  }),
};

/**
 * Recording D1 stub for the lifecycle / state-transition tests (#102, #103).
 * Captures every `prepare(...).bind(...).run()` invocation so a test can
 * assert on the exact SQL + bind args the route hands to D1.
 */
type DBCall = { sql: string; args: unknown[] };
function makeRecordingDB(): D1Database & { calls: DBCall[] } {
  const calls: DBCall[] = [];
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
    prepare: makeStmt as unknown as D1Database['prepare'],
    calls,
  } as unknown as D1Database & { calls: DBCall[] };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: { prepare: () => noopStatement } as unknown as D1Database,
    KV: makeFakeKV(),
    OPENAI_API_KEY: 'test-openai',
    DEEPSEEK_API_KEY: 'test-deepseek',
    REVENUECAT_WEBHOOK_SECRET: 'test-rc-secret',
    TURNSTILE_SECRET_KEY: '',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt',
    ...overrides,
  };
}

function buildApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api', webhookRoute);
  return app;
}

async function postWebhook(
  app: Hono<{ Bindings: Env }>,
  env: Env,
  body: Record<string, unknown>,
  authHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  const req = new Request('http://localhost/api/webhook/rc', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return app.fetch(req, env);
}

const RC_BODY = (id: string) => ({
  event: {
    id,
    app_user_id: 'user-1',
    type: 'INITIAL_PURCHASE',
    expiration_at_ms: 1893456000000,
    price: 1.99,
  },
});
describe('POST /api/webhook/rc - signature verification (issue #100)', () => {
  it('rejects missing Authorization header with 401', async () => {
    const env = makeEnv();
    const app = buildApp();
    const res = await postWebhook(app, env, RC_BODY('evt-noauth'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects non-Bearer scheme with 401', async () => {
    const env = makeEnv();
    const app = buildApp();
    const res = await postWebhook(app, env, RC_BODY('evt-basic'), 'Basic dGVzdA==');
    expect(res.status).toBe(401);
  });

  it('rejects wrong secret with 401 (mismatched length)', async () => {
    const env = makeEnv();
    const app = buildApp();
    const res = await postWebhook(
      app,
      env,
      RC_BODY('evt-wrong'),
      'Bearer not-the-real-secret-but-also-long',
    );
    expect(res.status).toBe(401);
  });

  it('rejects wrong secret with 401 (same length, different value)', async () => {
    const env = makeEnv();
    const app = buildApp();
    const res = await postWebhook(app, env, RC_BODY('evt-tamper'), 'Bearer xxxxxxxxxxxxxxx');
    expect(res.status).toBe(401);
  });

  it('accepts the correct Bearer secret with 200', async () => {
    const env = makeEnv();
    const app = buildApp();
    const res = await postWebhook(
      app,
      env,
      RC_BODY('evt-good'),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('never echoes the webhook secret in any response body', async () => {
    const env = makeEnv({ REVENUECAT_WEBHOOK_SECRET: 'super-secret-rc-xyz' });
    const app = buildApp();
    const wrongRes = await postWebhook(
      app,
      env,
      RC_BODY('evt-leak-1'),
      'Bearer wrong-secret-12345',
    );
    expect(await wrongRes.text()).not.toContain('super-secret-rc-xyz');
    const missingRes = await postWebhook(app, env, RC_BODY('evt-leak-2'));
    expect(await missingRes.text()).not.toContain('super-secret-rc-xyz');
    const okRes = await postWebhook(
      app,
      env,
      RC_BODY('evt-leak-3'),
      'Bearer super-secret-rc-xyz',
    );
    expect(await okRes.text()).not.toContain('super-secret-rc-xyz');
  });
});
describe('POST /api/webhook/rc - idempotency (issue #101)', () => {
  let env: Env;
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    env = makeEnv();
    app = buildApp();
  });

  it('first delivery of an event processes normally and returns 200', async () => {
    const res = await postWebhook(
      app,
      env,
      RC_BODY('evt-fresh-1'),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; deduped?: boolean };
    expect(body.status).toBe('ok');
    expect(body.deduped).toBeUndefined();
  });

  it('replay of the same event.id short-circuits to 200 OK with deduped flag', async () => {
    const eventBody = RC_BODY('evt-replay-1');
    const first = await postWebhook(
      app,
      env,
      eventBody,
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(first.status).toBe(200);
    const replay = await postWebhook(
      app,
      env,
      eventBody,
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { status: string; deduped?: boolean };
    expect(replayBody.status).toBe('ok');
    expect(replayBody.deduped).toBe(true);
  });

  it('records the event.id in KV with a 7-day TTL on first delivery', async () => {
    const kv = env.KV as ReturnType<typeof makeFakeKV>;
    const eventId = 'evt-ttl-1';
    const res = await postWebhook(
      app,
      env,
      RC_BODY(eventId),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const eventPut = kv.puts.find((p) => p.key === 'rc:event:' + eventId);
    expect(eventPut).toBeDefined();
    expect(eventPut!.opts?.expirationTtl).toBe(7 * 24 * 60 * 60);
  });

  it('dedupes only by event.id, not by payload hash (distinct events both process)', async () => {
    const a = await postWebhook(
      app,
      env,
      RC_BODY('evt-distinct-a'),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    const b = await postWebhook(
      app,
      env,
      RC_BODY('evt-distinct-b'),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const bBody = (await b.json()) as { deduped?: boolean };
    expect(bBody.deduped).toBeUndefined();
  });

  it('replay rejection runs after signature verification (replay without auth still 401)', async () => {
    await postWebhook(
      app,
      env,
      RC_BODY('evt-probe-1'),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    const unauth = await postWebhook(app, env, RC_BODY('evt-probe-1'));
    expect(unauth.status).toBe(401);
    const badAuth = await postWebhook(
      app,
      env,
      RC_BODY('evt-probe-1'),
      'Bearer wrong-secret-12345',
    );
    expect(badAuth.status).toBe(401);
  });

  it('processes events that lack an event.id (graceful fallback, no KV write)', async () => {
    const kv = env.KV as ReturnType<typeof makeFakeKV>;
    const eventIdless = {
      event: {
        app_user_id: 'user-1',
        type: 'INITIAL_PURCHASE',
        expiration_at_ms: 1893456000000,
        price: 1.99,
      },
    };
    const res = await postWebhook(
      app,
      env,
      eventIdless,
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const dedupePuts = kv.puts.filter((p) => p.key.startsWith('rc:event:'));
    expect(dedupePuts).toHaveLength(0);
  });
});
describe('POST /api/webhook/rc - state transitions (issue #102, #103)', () => {
  /**
   * Build an RC event body with the bare-minimum fields the route needs.
   * Tests only override the fields they care about.
   */
  function rcEvent(o: {
    id?: string;
    type: string;
    expiration_at_ms?: number | null;
    price?: number;
    app_user_id?: string;
  }): Record<string, unknown> {
    return {
      event: {
        id: o.id ?? 'evt-default',
        app_user_id: o.app_user_id ?? 'user-1',
        type: o.type,
        expiration_at_ms:
          o.expiration_at_ms === null ? undefined : o.expiration_at_ms ?? 1893456000000,
        price: o.price ?? 1.99,
      },
    };
  }

  function userUpdates(db: { calls: DBCall[] }): DBCall[] {
    return db.calls.filter((c) => /UPDATE\s+users\b/i.test(c.sql));
  }

  // Issue #102 — INITIAL_PURCHASE → 'pro'
  it('INITIAL_PURCHASE grants pro, sets subscription_expires, and credits net_ltv', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const expiresMs = 1893456000000;
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-initial', type: 'INITIAL_PURCHASE', expiration_at_ms: expiresMs, price: 1.99 }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const updates = userUpdates(db);
    expect(updates).toHaveLength(1);
    // Single statement mutates all three subscription columns in one UPDATE.
    expect(updates[0].sql).toBe(
      'UPDATE users SET is_pro = 1, subscription_expires = ?, net_ltv = net_ltv + ? WHERE id = ?',
    );
    // 85% net of $1.99 = $1.6915 (Apple Small Business Program).
    expect(updates[0].args).toEqual([
      new Date(expiresMs).toISOString(),
      1.99 * 0.85,
      'user-1',
    ]);
  });

  // Issue #102 — RENEWAL → 'pro' (idempotent)
  it('RENEWAL re-applies the pro state with the new expiration and credits net_ltv again', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const renewExpires = 1924992000000;
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-renew', type: 'RENEWAL', expiration_at_ms: renewExpires, price: 1.99 }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const updates = userUpdates(db);
    expect(updates).toHaveLength(1);
    // Identical SQL shape to INITIAL_PURCHASE → re-applying the same
    // statement is a no-op for is_pro and accumulates net_ltv, which is
    // the intended behavior for a renewal (new charge).
    expect(updates[0].sql).toBe(
      'UPDATE users SET is_pro = 1, subscription_expires = ?, net_ltv = net_ltv + ? WHERE id = ?',
    );
    expect(updates[0].args).toEqual([
      new Date(renewExpires).toISOString(),
      1.99 * 0.85,
      'user-1',
    ]);
  });

  // Issue #102 — CANCELLATION → 'free' (but keep pro access until expiry).
  // The "free" outcome is delivered lazily via subscription_expires —
  // is_pro stays untouched so the user keeps access until the period ends.
  it('CANCELLATION updates subscription_expires without revoking is_pro', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const cancelExpires = 1893456000000;
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-cancel', type: 'CANCELLATION', expiration_at_ms: cancelExpires }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const updates = userUpdates(db);
    expect(updates).toHaveLength(1);
    // Only subscription_expires is mutated; is_pro and net_ltv are NOT
    // touched. This is the "free but still has access" state encoded via
    // the period-end timestamp.
    expect(updates[0].sql).toBe(
      'UPDATE users SET subscription_expires = ? WHERE id = ?',
    );
    expect(updates[0].args).toEqual([
      new Date(cancelExpires).toISOString(),
      'user-1',
    ]);
  });

  // Issue #102 — EXPIRATION → 'free'
  it('EXPIRATION revokes pro access by setting is_pro = 0', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-expire', type: 'EXPIRATION' }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    const updates = userUpdates(db);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toBe('UPDATE users SET is_pro = 0 WHERE id = ?');
    expect(updates[0].args).toEqual(['user-1']);
  });

  // Issue #103 — full state machine lifecycle:
  //   purchase (pro) → renew (pro, new expiry) → cancel (still pro,
  //   period-end recorded) → expire (free).
  it('full lifecycle purchase → renew → cancel → expire walks the state machine', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const auth = 'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET;

    // 1. purchase
    await postWebhook(
      app,
      env,
      rcEvent({ id: 'lc-1', type: 'INITIAL_PURCHASE', expiration_at_ms: 1893456000000, price: 1.99 }),
      auth,
    );
    // 2. renew
    await postWebhook(
      app,
      env,
      rcEvent({ id: 'lc-2', type: 'RENEWAL', expiration_at_ms: 1924992000000, price: 1.99 }),
      auth,
    );
    // 3. cancel (still has access until period end)
    await postWebhook(
      app,
      env,
      rcEvent({ id: 'lc-3', type: 'CANCELLATION', expiration_at_ms: 1924992000000 }),
      auth,
    );
    // 4. expire (pro access revoked)
    await postWebhook(
      app,
      env,
      rcEvent({ id: 'lc-4', type: 'EXPIRATION' }),
      auth,
    );

    const updates = userUpdates(db);
    expect(updates).toHaveLength(4);
    expect(updates[0].sql).toMatch(/SET is_pro = 1, subscription_expires = \?, net_ltv = net_ltv \+ \?/);
    expect(updates[0].args[2]).toBe('user-1');
    expect(updates[1].sql).toMatch(/SET is_pro = 1, subscription_expires = \?, net_ltv = net_ltv \+ \?/);
    expect(updates[1].args[1]).toBe(1.99 * 0.85); // second renewal also credited
    expect(updates[2].sql).toBe('UPDATE users SET subscription_expires = ? WHERE id = ?');
    expect(updates[3].sql).toBe('UPDATE users SET is_pro = 0 WHERE id = ?');
  });

  // Issue #103 — concurrent (sequential, since Workers is single-threaded)
  // events for the same user are processed in arrival order.
  it('sequential events for the same user apply UPDATEs in arrival order', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const auth = 'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET;

    await postWebhook(
      app,
      env,
      rcEvent({ id: 'ce-1', type: 'INITIAL_PURCHASE', expiration_at_ms: 1893456000000, price: 1.99 }),
      auth,
    );
    await postWebhook(
      app,
      env,
      rcEvent({ id: 'ce-2', type: 'EXPIRATION' }),
      auth,
    );

    const updates = userUpdates(db);
    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toMatch(/SET is_pro = 1/);
    expect(updates[1].sql).toBe('UPDATE users SET is_pro = 0 WHERE id = ?');
  });

  // Issue #102 — non-PRODUCT / unknown events must NOT mutate the user
  // row (e.g., BILLING_ISSUE, future RC event types, malformed inputs).
  it('BILLING_ISSUE writes no UPDATE and just logs (no pro revocation)', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-billing', type: 'BILLING_ISSUE' }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    expect(userUpdates(db)).toHaveLength(0);
  });

  it('unknown event type writes no UPDATE (forward-compatible)', async () => {
    const db = makeRecordingDB();
    const env = makeEnv({ DB: db });
    const app = buildApp();
    const res = await postWebhook(
      app,
      env,
      rcEvent({ id: 'evt-future', type: 'SOMETHING_NEW_FROM_RC' }),
      'Bearer ' + env.REVENUECAT_WEBHOOK_SECRET,
    );
    expect(res.status).toBe(200);
    expect(userUpdates(db)).toHaveLength(0);
  });
});
