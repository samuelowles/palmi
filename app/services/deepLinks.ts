/**
 * Deep links to native subscription surfaces. Issue #40.
 *
 * On iOS 15+ the in-app `app-settings:` deep link opens the user's
 * Settings app directly on our subscription row. Older iOS and any
 * platform that can't handle the deep link fall back to the App Store
 * subscription management page. Android/web are no-ops until a Play
 * Store / web equivalent is wired up.
 */

import { Linking, Platform } from 'react-native';

const APPLE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';
const APPLE_IOS_MIN_VERSION = 15;

function iosVersion(): number {
  const v = Platform.Version;
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Open the OS-native subscription management surface. Never throws —
 * if the deep link fails and the fallback URL also fails, we resolve
 * silently so the caller's UI doesn't need its own try/catch.
 */
export async function openSubscriptions(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const canUseDeepLink = iosVersion() >= APPLE_IOS_MIN_VERSION;
  if (!canUseDeepLink) {
    await Linking.openURL(APPLE_SUBS_URL).catch(() => undefined);
    return;
  }

  try {
    await Linking.openURL('app-settings:');
  } catch {
    // Older iOSes sometimes have `app-settings:` registered but not
    // routable for our app — fall back to the App Store page.
    await Linking.openURL(APPLE_SUBS_URL).catch(() => undefined);
  }
}