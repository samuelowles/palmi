import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared store snapshot the helper reads. `vi.mock` is hoisted above this
// const, so we use `vi.hoisted` to share the mutable object between the
// factory and the test body.
const { store } = vi.hoisted(() => ({ store: { isPro: false } }));

vi.mock('../../stores/userStore', () => ({
  useUserStore: { getState: () => store },
}));

vi.mock('react-native-purchases', () => ({
  default: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    addCustomerInfoUpdateListener: vi.fn(),
    getOfferings: vi.fn(),
    getCustomerInfo: vi.fn(),
    restorePurchases: vi.fn(),
    purchasePackage: vi.fn(),
    logIn: vi.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}));

vi.mock('../../constants/config', () => ({
  Config: { revenueCatApiKey: 'test-key', entitlementId: 'pro' },
}));

import { isPro } from '../revenue';

describe('isPro — entitlement helper (issue #34)', () => {
  beforeEach(() => {
    store.isPro = false;
  });

  it('returns true when the store snapshot has isPro=true', () => {
    store.isPro = true;
    expect(isPro()).toBe(true);
  });

  it('returns false when the store snapshot has isPro=false', () => {
    store.isPro = false;
    expect(isPro()).toBe(false);
  });

  // Fail-closed: a fresh store before any entitlement fetch (or after a
  // network failure that `checkEntitlements` swallows) defaults to false,
  // so the helper never accidentally grants Pro.
  it('returns false on a fresh store (fail-closed: no entitlement check has run)', () => {
    store.isPro = false;
    expect(isPro()).toBe(false);
  });
});