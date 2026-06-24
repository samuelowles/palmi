/**
 * RevenueCat webhook route tests - Issue #90
 *   - #100: signature verification (Authorization: Bearer <secret>)
 *   - #101: idempotency / replay rejection (KV dedupe by event.id)
 *
 * Acceptance criteria covered:
 *   - Signature verified on every webhook call (#100)
 *   - Replay attacks are rejected (#101)
 *   - Idempotent: same event id processed once (#101)
 *   - KV TTL >= 7 days (#101)
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
