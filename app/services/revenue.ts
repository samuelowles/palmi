/**
 * Revenue Service — RevenueCat SDK wrapper
 * Handles subscription purchases, restoration, and entitlement checks.
 */

import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { Config } from '../constants/config';
import { useUserStore } from '../stores/userStore';

/** RevenueCat purchase error shape */
interface RevenueCatError extends Error {
  userCancelled?: boolean;
}

let isInitialized = false;

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 */
export async function initRevenueCat(): Promise<void> {
  if (isInitialized) return;

  if (!Config.revenueCatApiKey) {
    console.warn('[Revenue] No RevenueCat API key configured');
    return;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({
      apiKey: Config.revenueCatApiKey,
    });

    isInitialized = true;

    // Check initial entitlements
    await checkEntitlements();

    // Listen for subscription changes
    Purchases.addCustomerInfoUpdateListener((info) => {
      updateEntitlements(info);
    });
  } catch (error) {
    console.error('[Revenue] Init failed:', error);
  }
}

/**
 * Fetch current offerings (packages/prices).
 */
export async function getOfferings(): Promise<PurchasesPackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;

    if (!currentOffering) {
      console.warn('[Revenue] No current offering available');
      return null;
    }

    // Find the weekly package
    const weeklyPackage = currentOffering.weekly;
    return weeklyPackage || currentOffering.availablePackages[0] || null;
  } catch (error) {
    console.error('[Revenue] Failed to get offerings:', error);
    return null;
  }
}

/**
 * Purchase the pro subscription.
 */
export async function purchasePro(): Promise<boolean> {
  try {
    const pkg = await getOfferings();
    if (!pkg) {
      throw new Error('No package available');
    }

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    updateEntitlements(customerInfo);

    return useUserStore.getState().isPro;
  } catch (error: unknown) {
    const revError = error as RevenueCatError;
    if (revError.userCancelled) {
      // User cancelled — not an error
      return false;
    }
    console.error('[Revenue] Purchase failed:', error);
    throw error;
  }
}

/**
 * Restore previous purchases (Apple mandate).
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    updateEntitlements(customerInfo);
    return useUserStore.getState().isPro;
  } catch (error) {
    console.error('[Revenue] Restore failed:', error);
    throw error;
  }
}

/**
 * Check current entitlements.
 */
export async function checkEntitlements(): Promise<void> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    updateEntitlements(customerInfo);
  } catch (error) {
    console.error('[Revenue] Entitlement check failed:', error);
  }
}

/**
 * Update user store based on CustomerInfo.
 */
function updateEntitlements(info: CustomerInfo): void {
  const proEntitlement = info.entitlements.active[Config.entitlementId];
  const isPro = proEntitlement !== undefined;

  useUserStore.getState().setPro(isPro);
  useUserStore.getState().setSubscriptionExpiry(
    proEntitlement?.expirationDate || null
  );
}

/**
 * Set user ID for RevenueCat (after user identification).
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    console.error('[Revenue] Identify failed:', error);
  }
}

/**
 * Single API for Pro entitlement checks. Reads the store snapshot, so it is
 * non-reactive — prefer `useUserStore((s) => s.isPro)` inside React renders.
 *
 * Fail-closed by construction: `useUserStore` initialises `isPro` to false
 * and `checkEntitlements` swallows network errors, so a failed entitlement
 * fetch leaves the snapshot at false. Issue #34.
 */
export function isPro(): boolean {
  return useUserStore.getState().isPro;
}
