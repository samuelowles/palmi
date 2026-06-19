/**
 * Analytics Route — event ingestion + ROI dashboard
 * POST /api/analytics — client event tracking
 * GET /api/marketing-roi — Hermes agent ROI dashboard
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { rateLimit } from '../lib/rateLimiter';

interface MarketingRoiRow {
  acquisition_source: string | null;
  total_users: number;
  total_net_revenue: number | null;
}

export const analyticsRoute = new Hono<{ Bindings: Env }>();

// Rate limit: 60 analytics events per minute per IP
analyticsRoute.use('/analytics', rateLimit({ maxRequests: 60, windowSeconds: 60 }));

// --- Event Tracking ---

analyticsRoute.post('/analytics', async (c) => {
  try {
    // Enforce request body size limit before parsing (10 KB max — analytics events are small JSON)
    const contentLength = parseInt(c.req.header('Content-Length') || '', 10);
    if (!isNaN(contentLength) && contentLength > 10 * 1024) {
      return c.json({ error: 'Request body too large' }, 413);
    }

    const body = await c.req.json<{
      event: string;
      properties?: Record<string, unknown>;
      userId?: string;
      timestamp?: string;
    }>();

    if (!body.event) {
      return c.json({ error: 'Event name is required' }, 400);
    }

    // Log for observability; forward to analytics provider (PostHog, etc.)
    console.log(
      `[Analytics] ${body.event}`,
      JSON.stringify({
        userId: body.userId || 'anonymous',
        properties: body.properties || {},
        timestamp: body.timestamp || new Date().toISOString(),
      })
    );

    // Store raw event in D1 for Hermes agent consumption
    const id = crypto.randomUUID();
    const now = body.timestamp || new Date().toISOString();
    const userId = body.userId || 'anonymous';

    await c.env.DB.prepare(
      `INSERT INTO analytics_events (id, user_id, event, properties, created_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, userId, body.event, JSON.stringify(body.properties || {}), now)
      .run();

    return c.json({ status: 'ok', id });
  } catch (error) {
    console.error('Analytics event failed:', error);
    return c.json({ error: 'Event ingestion failed' }, 500);
  }
});

// --- ROI Dashboard ---

analyticsRoute.get('/marketing-roi', async (c) => {
  try {
    // 1. Calculate Net LTV and Total Users per Acquisition Source
    const usersResult = await c.env.DB.prepare(`
      SELECT 
        acquisition_source, 
        COUNT(id) as total_users,
        SUM(net_ltv) as total_net_revenue
      FROM users
      GROUP BY acquisition_source
    `).all();

    // 2. Calculate Estimated AI Costs
    const readingsCost = await c.env.DB.prepare(`
      SELECT SUM(estimated_ai_cost) as total_readings_cost FROM readings
    `).first<{ total_readings_cost: number }>();

    const synergyCost = await c.env.DB.prepare(`
      SELECT SUM(estimated_ai_cost) as total_synergy_cost FROM synergy_results
    `).first<{ total_synergy_cost: number }>();

    const totalAiCost = (readingsCost?.total_readings_cost || 0) + (synergyCost?.total_synergy_cost || 0);

    // 3. Format Response for Hermes Agent
    const roiBySource = (usersResult.results as unknown as MarketingRoiRow[]).map((row) => ({
      source: row.acquisition_source || 'organic',
      totalUsers: row.total_users,
      totalNetRevenue: row.total_net_revenue,
      // We can allocate AI cost per source if we joined readings, but for now we aggregate.
    }));

    return c.json({
      status: 'success',
      totalEstimatedAiCost: totalAiCost,
      roiBySource,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics ROI calculation failed:', error);
    return c.json({ error: 'Failed to calculate ROI' }, 500);
  }
});
