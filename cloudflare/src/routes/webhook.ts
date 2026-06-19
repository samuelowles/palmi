/**
 * Webhook Route — POST /api/webhook/rc
 * RevenueCat webhook handler for subscription events.
 * Uses constant-time token comparison. Models subscription as a state machine:
 *   ACTIVE -> CANCELLED (auto-renew off, still has access) -> EXPIRED (access revoked)
 */

import { Hono } from 'hono';
import type { Env } from '../index';

interface RevenueCatEvent {
  event?: {
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

async function verifyWebhookToken(
  received: string | undefined,
  expectedSecret: string
): Promise<boolean> {
  if (!received || !received.startsWith('Bearer ')) return false;
  const receivedToken = received.slice('Bearer '.length);
  const encoder = new TextEncoder();
  const a = encoder.encode(receivedToken);
  const b = encoder.encode(expectedSecret);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

webhookRoute.post('/webhook/rc', async (c) => {
  try {
    // Constant-time webhook auth verification
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

    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});
