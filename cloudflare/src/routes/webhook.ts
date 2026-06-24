/**
 * Webhook Route — POST /api/webhook/rc
 * RevenueCat webhook handler for subscription events.
 * Uses constant-time token comparison. Models subscription as a state machine:
 *   ACTIVE -> CANCELLED (auto-renew off, still has access) -> EXPIRED (access revoked)
 *
 * Issue #90 (parent) covers:
 *   #100 Signature verification: Authorization: Bearer <shared_secret> is
 *        checked in constant time against REVENUECAT_WEBHOOK_SECRET.
 *   #101 Idempotency: each event.id is recorded in KV with a 7-day TTL so
 *        a replay short-circuits to 200 OK without re-running the state
 *        machine.
 */

import { Hono } from 'hono';
import type { Env } from '../index';

interface RevenueCatEvent {
  event?: {
    id?: string;
    app_user_id?: string;
    type?: string;
    expiration_at_ms?: number;
    price?: number;
  };
}

export const webhookRoute = new Hono<{ Bindings: Env }>();

type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'PRODUCT_CHANGE'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE';

// Issue #101 — 7-day dedup window. RevenueCat retries transient failures
// for up to ~72h; 7 days comfortably covers that and stays short enough
// to keep the KV namespace small.
const DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Constant-time equality check on two byte buffers. Used to compare the
 * Bearer token sent by RevenueCat to the configured shared secret in
 * constant time so timing attacks can't recover the secret byte-by-byte.
 * Implemented with a bitwise XOR fold so the same code runs identically
 * on Node (test env) and on the Workers runtime (which lacks the
 * non-standard `crypto.subtle.timingSafeEqual`).
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Issue #100 — verify the Authorization: Bearer <shared_secret> header
 * against the configured RevenueCat webhook secret in constant time.
 * RevenueCat's actual webhook auth is a static shared secret (no body
 * HMAC), so the security guarantee is the constant-time comparison
 * itself.
 */
async function verifyWebhookToken(
  received: string | undefined,
  expectedSecret: string
): Promise<boolean> {
  if (!received || !received.startsWith('Bearer ')) return false;
  const receivedToken = received.slice('Bearer '.length);
  const encoder = new TextEncoder();
  const a = encoder.encode(receivedToken);
  const b = encoder.encode(expectedSecret);
  return constantTimeEqual(a, b);
}

webhookRoute.post('/webhook/rc', async (c) => {
  try {
    // Constant-time webhook auth verification (issue #100)
    const authHeader = c.req.header('Authorization');
    const isValid = await verifyWebhookToken(authHeader, c.env.REVENUECAT_WEBHOOK_SECRET);
    if (!isValid) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json<RevenueCatEvent>();
    const event = body.event;

    if (!event) {
      return c.json({ error: 'No event in body' }, 400);
    }

    // Issue #101 — idempotency / replay rejection.
    // A replayed webhook (RC network retry, RC backfill, or attacker
    // replay) hits this branch and short-circuits to a 200 OK no-op so
    // the state machine never runs twice for the same logical event.
    // The dedup key is namespaced under "rc:event:" to avoid colliding
    // with other KV users (auth.ts uses "token:" / "refresh:").
    const eventId = event.id;
    if (eventId) {
      const dedupeKey = `rc:event:${eventId}`;
      const alreadyProcessed = await c.env.KV.get(dedupeKey);
      if (alreadyProcessed) {
        return c.json({ status: 'ok', deduped: true });
      }
    }

    const appUserId = event.app_user_id;
    const eventType = event.type as RevenueCatEventType;
    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    console.log(`[RevenueCat] ${eventType} for ${appUserId}`);

    // Subscription state machine
    switch (eventType) {
      // Access granted / renewed
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE': {
        const grossPrice = event.price || 1.99;
        const appStoreFeeRate = 0.15;
        const netRevenue = grossPrice * (1 - appStoreFeeRate);

        await c.env.DB.prepare(
          'UPDATE users SET is_pro = 1, subscription_expires = ?, net_ltv = net_ltv + ? WHERE id = ?'
        ).bind(expiresAt, netRevenue, appUserId).run();
        break;
      }

      // Auto-renew turned off — user keeps access until period ends
      case 'CANCELLATION':
        await c.env.DB.prepare(
          'UPDATE users SET subscription_expires = ? WHERE id = ?'
        ).bind(expiresAt, appUserId).run();
        break;

      // Access period ended — revoke pro
      case 'EXPIRATION':
        await c.env.DB.prepare(
          'UPDATE users SET is_pro = 0 WHERE id = ?'
        ).bind(appUserId).run();
        break;

      // Payment failed — don't revoke immediately, let RevenueCat retry
      case 'BILLING_ISSUE':
        console.log(`[RevenueCat] Billing issue for ${appUserId} — awaiting retry`);
        break;

      default:
        console.warn(`[RevenueCat] Unhandled event type: ${eventType}`);
    }

    // Mark the event as processed in KV with a 7-day TTL (issue #101).
    // Written AFTER the state machine so a mid-flight DB failure leaves
    // the event un-claimed and RC's retry can re-run the switch.
    if (eventId) {
      await c.env.KV.put(`rc:event:${eventId}`, '1', {
        expirationTtl: DEDUPE_TTL_SECONDS,
      });
    }

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});
