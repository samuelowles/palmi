/**
 * Palmi API — Cloudflare Workers entry point
 * Hono router with D1, KV, and external API integrations.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import { securityHeaders } from './middleware/securityHeaders';
import { authRoute } from './routes/auth';
import { palmRoute } from './routes/palm';
import { readingRoute } from './routes/reading';
import { synergyRoute } from './routes/synergy';
import { webhookRoute } from './routes/webhook';
import { analyticsRoute } from './routes/analytics';
import { privacyRoute } from './routes/privacy';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  OPENAI_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  REVENUECAT_WEBHOOK_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  ENVIRONMENT: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// Security headers — applied globally before CORS
app.use('*', securityHeaders);

// CORS — restrict in production
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://getpalmi.com',
      'https://palmi-api.workers.dev',
    ];
    // Allow localhost in dev, specific origins in prod
    if (!origin || origin.startsWith('http://localhost')) return origin || '*';
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'palmi-api', version: '1.0.0' }));

// Auth routes (no auth middleware — register/refresh)
app.route('/api', authRoute);

// Protected routes — apply auth middleware
app.use('/api/read-palm', authMiddleware);
app.use('/api/reading/*', authMiddleware);
app.use('/api/synergy', authMiddleware);

app.route('/api', palmRoute);
app.route('/api', readingRoute);
app.route('/api', synergyRoute);

// Public routes (webhook is RC signed, analytics is unauthenticated)
app.route('/api', webhookRoute);
app.route('/api', analyticsRoute);

// Privacy routes (apply own authMiddleware internally via /privacy/*)
app.route('/api', privacyRoute);

// 404
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err?.message ?? String(err));
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
