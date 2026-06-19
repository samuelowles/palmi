import { describe, it, expect, beforeEach, vi } from 'vitest';

// AsyncStorage depends on window, which doesn't exist in Node.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useUserStore } from '../userStore';

describe('useUserStore', () => {
  beforeEach(() => {
    useUserStore.getState().reset();
  });

  it('should have correct initial state', () => {
    const state = useUserStore.getState();

    expect(state.userId).toBeNull();
    expect(state.isOnboarded).toBe(false);
    expect(state.isPro).toBe(false);
    expect(state.subscriptionExpiresAt).toBeNull();
  });

  it('should update userId with setUserId', () => {
    useUserStore.getState().setUserId('user-abc-123');

    const state = useUserStore.getState();
    expect(state.userId).toBe('user-abc-123');
  });

  it('should toggle isOnboarded with setOnboarded', () => {
    useUserStore.getState().setOnboarded(true);
    expect(useUserStore.getState().isOnboarded).toBe(true);

    useUserStore.getState().setOnboarded(false);
    expect(useUserStore.getState().isOnboarded).toBe(false);
  });

  it('should update isPro with setPro', () => {
    useUserStore.getState().setPro(true);
    expect(useUserStore.getState().isPro).toBe(true);

    useUserStore.getState().setPro(false);
    expect(useUserStore.getState().isPro).toBe(false);
  });

  it('should set subscriptionExpiresAt with null', () => {
    useUserStore.getState().setSubscriptionExpiry(null);
    expect(useUserStore.getState().subscriptionExpiresAt).toBeNull();
  });

  it('should set subscriptionExpiresAt with ISO string', () => {
    const expiry = '2026-12-31T23:59:59.000Z';
    useUserStore.getState().setSubscriptionExpiry(expiry);

    expect(useUserStore.getState().subscriptionExpiresAt).toBe(expiry);
  });

  it('should transition subscriptionExpiry from value to null', () => {
    useUserStore.getState().setSubscriptionExpiry('2026-06-01T00:00:00Z');
    expect(useUserStore.getState().subscriptionExpiresAt).toBe('2026-06-01T00:00:00Z');

    useUserStore.getState().setSubscriptionExpiry(null);
    expect(useUserStore.getState().subscriptionExpiresAt).toBeNull();
  });

  it('should reset all values to initial state', () => {
    // Mutate all fields away from defaults
    useUserStore.getState().setUserId('user-to-reset');
    useUserStore.getState().setOnboarded(true);
    useUserStore.getState().setPro(true);
    useUserStore.getState().setSubscriptionExpiry('2026-12-31T23:59:59.000Z');

    // Execute reset
    useUserStore.getState().reset();

    // Verify everything returned to defaults
    const state = useUserStore.getState();
    expect(state.userId).toBeNull();
    expect(state.isOnboarded).toBe(false);
    expect(state.isPro).toBe(false);
    expect(state.subscriptionExpiresAt).toBeNull();
  });

  it('should not interfere between independent field updates', () => {
    useUserStore.getState().setUserId('user-456');
    useUserStore.getState().setOnboarded(true);

    const state = useUserStore.getState();
    expect(state.userId).toBe('user-456');
    expect(state.isOnboarded).toBe(true);
    expect(state.isPro).toBe(false);
    expect(state.subscriptionExpiresAt).toBeNull();
  });
});
