import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mutable Platform + Linking mock so the test body and the hoisted
// factory can both read/write the same values.
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

const APPLE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

describe('openSubscriptions — iOS Settings deep link (issue #40)', () => {
  beforeEach(() => {
    mockOpenURL.mockReset();
    platform.OS = 'ios';
    platform.Version = '15.0';
  });

  it('opens app-settings: on iOS 15.0', async () => {
    platform.Version = '15.0';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith('app-settings:');
  });

  it('opens app-settings: on iOS 16.4', async () => {
    platform.Version = '16.4';
    mockOpenURL.mockResolvedValueOnce(undefined);

    await openSubscriptions();

    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).toHaveBeenCalledWith('app-settings:');
  });

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

  it('is a no-op on Android', async () => {
    platform.OS = 'android';
    platform.Version = 30;

    await openSubscriptions();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    platform.OS = 'web';
    platform.Version = '0.0';

    await openSubscriptions();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('resolves without throwing when the fallback URL also rejects', async () => {
    platform.Version = '14.5';
    mockOpenURL.mockRejectedValueOnce(new Error('Cannot open URL'));

    await expect(openSubscriptions()).resolves.toBeUndefined();
  });
});