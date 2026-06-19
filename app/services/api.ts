/**
 * API Service — Cloudflare Workers API client
 * All backend calls go through here. Never fetch directly from components.
 */

import { Config } from '../constants/config';
import { useUserStore } from '../stores/userStore';
import type { PalmReading } from '../stores/readingStore';

const BASE_URL = Config.apiBaseUrl;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const DEFAULT_TIMEOUT = 30_000; // 30s for AI endpoints
const QUICK_TIMEOUT = 10_000;     // 10s for simple lookups

// --- Auth Token Management ---

let tokenRefreshPromise: Promise<{ token: string; refreshToken: string; expiresAt: string } | null> | null = null;

function getAuthHeaders(): Record<string, string> {
  const { token } = useUserStore.getState();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function request<T extends object>(
  path: string,
  options: (RequestInit & { timeout?: number; skipAuth?: boolean }) = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, skipAuth = false, ...fetchOptions } = options;
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string> | undefined),
    };

    if (!skipAuth) {
      Object.assign(headers, getAuthHeaders());
    }

    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && !skipAuth) {
        const refreshResult = await refreshTokenIfNeeded();
        if (refreshResult) {
          // Retry once with new token
          const retryResponse = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(fetchOptions.headers as Record<string, string> | undefined),
              Authorization: `Bearer ${refreshResult.token}`,
            },
          });

          if (retryResponse.ok) {
            return retryResponse.json() as Promise<T>;
          }

          const retryBody = await retryResponse.text().catch(() => 'Retry failed');
          throw new ApiError(retryBody, retryResponse.status);
        }
      }

      const body = await response.text().catch(() => 'Unknown error');
      throw new ApiError(body, response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshTokenIfNeeded(): Promise<{ token: string; refreshToken: string; expiresAt: string } | null> {
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  const { refreshToken } = useUserStore.getState();
  if (!refreshToken) return null;

  tokenRefreshPromise = (async () => {
    try {
      const response = await request<{
        token: string;
        refreshToken: string;
        expiresAt: string;
      }>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      });

      useUserStore.getState().setTokens(response.token, response.refreshToken, response.expiresAt);
      return response;
    } catch {
      useUserStore.getState().clearAuth();
      await reRegister();
      return null;
    }
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

async function reRegister(): Promise<void> {
  const { userId } = useUserStore.getState();
  if (!userId) return;

  try {
    const response = await request<{
      token: string;
      refreshToken: string;
      expiresAt: string;
      userId: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ userId }),
      skipAuth: true,
    });

    useUserStore.getState().setAuth(
      response.userId,
      response.token,
      response.refreshToken,
      response.expiresAt
    );
  } catch (error) {
    console.error('Re-registration failed:', error);
  }
}

export async function registerUser(existingUserId?: string): Promise<{ userId: string; token: string }> {
  const response = await request<{
    token: string;
    refreshToken: string;
    expiresAt: string;
    userId: string;
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ userId: existingUserId }),
    skipAuth: true,
  });

  useUserStore.getState().setAuth(
    response.userId,
    response.token,
    response.refreshToken,
    response.expiresAt
  );

  return { userId: response.userId, token: response.token };
}

// --- Palm Reading ---

interface ReadPalmRequest {
  imageBase64: string;
  turnstileToken?: string;
}

interface ReadPalmResponse {
  reading: PalmReading;
}

export async function readPalm(data: ReadPalmRequest): Promise<PalmReading> {
  const response = await request<ReadPalmResponse>('/api/read-palm', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.reading;
}

// --- Get Reading ---

export async function getReading(readingId: string): Promise<PalmReading> {
  return request<PalmReading>(`/api/reading/${readingId}`, { timeout: QUICK_TIMEOUT });
}

// --- Synergy / Bestie Compare ---

interface SynergyRequest {
  readingIdA: string;
  readingIdB: string;
}

export interface SynergyResult {
  score: number;
  matchLabel: string;
  personA: { name: string; archetype: string; emoji: string };
  personB: { name: string; archetype: string; emoji: string };
  insights: string[];
}

export async function comparePalms(data: SynergyRequest): Promise<SynergyResult> {
  return request<SynergyResult>('/api/synergy', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Analytics ---

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  userId?: string;
  timestamp?: string;
}

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  // Fire and forget — don't block UI on analytics
  request('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    }),
  }).catch(() => {
    // Silently fail — analytics should never break the app
  });
}
