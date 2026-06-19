import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readPalm, getReading, comparePalms, trackEvent } from '../api';
import type { PalmReading } from '../../stores/readingStore';

// Mock the Config module so tests use a fixed URL instead of the real one
// (which relies on the Expo __DEV__ global that does not exist in Node)
vi.mock('../../constants/config', () => ({
  Config: { apiBaseUrl: 'https://test-api.example.com' },
}));

// Mock userStore so auth headers are predictable
vi.mock('../../stores/userStore', () => ({
  useUserStore: {
    getState: vi.fn(() => ({
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      userId: 'user-store-id',
      setTokens: vi.fn(),
      setAuth: vi.fn(),
      clearAuth: vi.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fake Response object the request() function expects. */
function mockFetchResponse<T>(data: T, status = 200): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: 'https://test-api.example.com',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
    bytes: vi.fn(),
    blob: vi.fn(),
    arrayBuffer: vi.fn(),
    formData: vi.fn(),
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
  } as Response;
}

/** Create a placeholder PalmReading for use in assertions. */
function createReading(overrides?: Partial<PalmReading>): PalmReading {
  return {
    id: 'reading-123',
    userId: 'user-456',
    imageUri: 'file://test/palm.jpg',
    lines: [
      {
        type: 'life',
        label: 'Life Line',
        strength: 85,
        archetype: 'The Voyager',
        emoji: '🌊',
        shortSummary: 'A long and adventurous life',
        fullReading: 'Your life line indicates a journey full of discovery.',
        isPremium: false,
      },
    ],
    overallSummary: 'A promising future awaits you.',
    archetype: 'The Seeker',
    archetypeEmoji: '🔍',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockSynergyResult = {
  score: 85,
  matchLabel: 'Soulmates',
  personA: { name: 'Alice', archetype: 'The Seeker', emoji: '🔍' },
  personB: { name: 'Bob', archetype: 'The Healer', emoji: '💚' },
  insights: ['Deep emotional connection', 'Shared life goals'],
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('API Service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // request() — indirectly exercised through every public function
  // -----------------------------------------------------------------------
  describe('request()', () => {
    it('should parse JSON and return data on a successful response', async () => {
      const reading = createReading();
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ reading }));

      const result = await readPalm({ imageBase64: 'base64data' });

      expect(result).toEqual(reading);
    });

    it('should throw ApiError with the status code and body text on a 404', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse('Not Found', 404));

      await expect(
        readPalm({ imageBase64: 'data' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        message: 'Not Found',
      });
    });

    it('should throw ApiError with status 0 on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Failed to fetch'));

      await expect(
        readPalm({ imageBase64: 'data' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 0,
        message: 'Failed to fetch',
      });
    });

    it('should throw ApiError with status 408 on abort/timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(global.fetch).mockRejectedValue(abortError);

      await expect(
        readPalm({ imageBase64: 'data' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 408,
        message: 'Request timed out',
      });
    });

    it('should use "Network error" when fetch throws a non-Error value', async () => {
      vi.mocked(global.fetch).mockRejectedValue('Boom');

      await expect(
        readPalm({ imageBase64: 'data' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 0,
        message: 'Network error',
      });
    });

    it('should include Content-Type: application/json in every request', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ reading: createReading() }),
      );

      await readPalm({ imageBase64: 'data' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should merge caller-supplied options with the default Content-Type header', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ reading: createReading() }),
      );

      await readPalm({ imageBase64: 'data' });

      const [, options] = vi.mocked(global.fetch).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(options.headers).toEqual(
        expect.objectContaining({ 'Content-Type': 'application/json' }),
      );
      expect(options.method).toBe('POST');
      expect(options.body).toEqual(expect.any(String));
    });
  });

  // -----------------------------------------------------------------------
  // readPalm()
  // -----------------------------------------------------------------------
  describe('readPalm()', () => {
    it('should POST to /api/read-palm', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ reading: createReading() }),
      );

      await readPalm({ imageBase64: 'data' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/read-palm',
        expect.any(Object),
      );
    });

    it('should send imageBase64 and turnstileToken in the POST body (no userId — auth is via Bearer)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ reading: createReading() }),
      );

      await readPalm({
        imageBase64: '/9j/4AAQSkZ==',
        turnstileToken: 'cf-token',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            imageBase64: '/9j/4AAQSkZ==',
            turnstileToken: 'cf-token',
          }),
        }),
      );
    });

    it('should return the reading from response.reading', async () => {
      const reading = createReading({
        id: 'specific-reading',
        archetype: 'The Healer',
      });
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ reading }),
      );

      const result = await readPalm({ imageBase64: 'data' });

      expect(result).toBe(reading);
    });

    it('should throw ApiError with status 500 on a server error', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse('Internal Server Error', 500));

      await expect(
        readPalm({ imageBase64: 'data' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Internal Server Error',
      });
    });
  });

  // -----------------------------------------------------------------------
  // getReading()
  // -----------------------------------------------------------------------
  describe('getReading()', () => {
    it('should GET /api/reading/{readingId}', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(createReading()),
      );

      await getReading('reading-abc');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/reading/reading-abc',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should return the reading object directly', async () => {
      const reading = createReading({ id: 'direct-return' });
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse(reading));

      const result = await getReading('direct-return');

      expect(result).toEqual(reading);
    });

    it('should throw ApiError with status 404 when the reading does not exist', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse('Reading not found', 404));

      await expect(getReading('nonexistent')).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        message: 'Reading not found',
      });
    });
  });

  // -----------------------------------------------------------------------
  // comparePalms()
  // -----------------------------------------------------------------------
  describe('comparePalms()', () => {
    it('should POST to /api/synergy with both reading IDs', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockSynergyResult),
      );

      await comparePalms({ readingIdA: 'reading-a', readingIdB: 'reading-b' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/synergy',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            readingIdA: 'reading-a',
            readingIdB: 'reading-b',
          }),
        }),
      );
    });

    it('should return a SynergyResult on success', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockSynergyResult),
      );

      const result = await comparePalms({ readingIdA: 'a', readingIdB: 'b' });

      expect(result).toEqual(mockSynergyResult);
    });

    it('should throw ApiError with status 403 when ownership check fails', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse('Unauthorized — you must own at least one of the readings', 403),
      );

      await expect(
        comparePalms({ readingIdA: 'a', readingIdB: 'b' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 403,
        message: 'Unauthorized — you must own at least one of the readings',
      });
    });

    it('should throw ApiError with status 404 when a reading does not exist', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse('One or both readings not found', 404),
      );

      await expect(
        comparePalms({ readingIdA: 'valid', readingIdB: 'nonexistent' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        message: 'One or both readings not found',
      });
    });

    it('should throw ApiError with status 400 when IDs are invalid', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse('Invalid reading ID format', 400),
      );

      await expect(
        comparePalms({ readingIdA: 'not-a-uuid', readingIdB: 'also-not' }),
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        message: 'Invalid reading ID format',
      });
    });
  });

  // -----------------------------------------------------------------------
  // trackEvent() — fire-and-forget analytics
  // -----------------------------------------------------------------------
  describe('trackEvent()', () => {
    it('should POST to /api/analytics with event data', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse(null));

      trackEvent({
        event: 'screen_view',
        properties: { screen: 'home' },
        userId: 'u1',
      });

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'https://test-api.example.com/api/analytics',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"screen_view"'),
          }),
        );
      });
    });

    it('should include a timestamp when none is provided in the event', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse(null));

      trackEvent({ event: 'test_event' });

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const [, options] = vi.mocked(global.fetch).mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(options.body as string);
      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('string');
      expect(body.event).toBe('test_event');
    });

    it('should use the provided timestamp when one is supplied', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse(null));

      trackEvent({
        event: 'identify',
        timestamp: '2025-06-15T10:00:00.000Z',
      });

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const [, options] = vi.mocked(global.fetch).mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(options.body as string);
      expect(body.timestamp).toBe('2025-06-15T10:00:00.000Z');
    });

    it('should NOT throw on network failure (silent fail)', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network down'));

      await expect(
        trackEvent({ event: 'test' }),
      ).resolves.toBeUndefined();
    });

    it('should NOT throw on server error (silent fail)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse('Server Error', 500));

      await expect(
        trackEvent({ event: 'test' }),
      ).resolves.toBeUndefined();
    });
  });
});
