import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` is hoisted above this const, so we use `vi.hoisted` to share
// a single mutable mock function between the factory and the test body.
const { mockOpenURL, platform } = vi.hoisted(() => {
  const mockOpenURL = vi.fn();
  const platform: { OS: 'ios' | 'android' | 'web'; Version: string | number } = {
    OS: 'ios',
    Version: '15.0',
  };
  return { mockOpenURL, platform };
});

vi.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
  Linking: { openURL: mockOpenURL },
}));

import { openSubscriptions } from '../deepLinks';
import { Linking, Platform } from 'react-native';

const APPLE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

describe('openSubscriptions', () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    // Reset to a known default before each test.
    platform.OS = 'ios';
    platform.Version = '15.0';
  });

  // -----------------------------------------------------------------------
  // iOS 15+ — use the in-app 'app-settings:' deep link
  // -----------------------------------------------------------------------
  it('opens the iOS Settings app via app-settings: on iOS 15.0', async () => {
    platform.Version = '15.0';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith('app-settings:');
  });

  it('opens the iOS Settings app via app-settings: on iOS 16.4', async () => {
    platform.Version = '16.4';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith('app-settings:');
  });

  // -----------------------------------------------------------------------
  // Fallback paths — App Store subscriptions page (iOS only)
  // -----------------------------------------------------------------------
  it('falls back to the App Store URL on iOS 14.5', async () => {
    platform.Version = '14.5';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith(APPLE_SUBS_URL);
  });

  it('falls back to the App Store URL when app-settings: throws on iOS 15', async () => {
    platform.Version = '15.0';
    mockOpenURL
      .mockRejectedValueOnce(new Error('Cannot open URL'))
      .mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(2);
    expect(mockOpenURL).toHaveBeenNthCalledWith(1, 'app-settings:');
    expect(mockOpenURL).toHaveBeenNthCalledWith(2, APPLE_SUBS_URL);
  });

  // -----------------------------------------------------------------------
  // Non-iOS platforms — no-op (gated until a Play Store / web equivalent is wired up)
  // -----------------------------------------------------------------------
  it('is a no-op on Android', async () => {
    platform.OS = 'android';
    platform.Version = 30;
    mockOpenURL.mockResolvedValueOnce(undefined);

    await expect(openSubscriptions()).resolves.toBeUndefined();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    platform.OS = 'web';
    platform.Version = '0.0';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await expect(openSubscriptions()).resolves.toBeUndefined();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Hardening — never throws to the caller
  // -----------------------------------------------------------------------
  it('resolves without throwing when the fallback URL also rejects', async () => {
    platform.Version = '14.5';
    mockOpenURL.mockRejectedValueOnce(new Error('Cannot open URL'));

    await expect(openSubscriptions()).resolves.toBeUndefined();
    // The Linking module was used; just sanity-check the mock was wired up.
    expect(Linking.openURL).toBe(mockOpenURL);
    // Platform is the same object the SUT reads from.
    expect(Platform).toBe(platform);
  });
});

