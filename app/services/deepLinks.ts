/**
 * Deep link helpers — open external subscription / app screens.
 *
 * NOTE: subscription management is currently iOS-only. The Settings screen
 * only exposes this action for iOS Pro users; on Android/web this helper is
 * a no-op until a Play Store / web equivalent is wired up.
 */

import { Linking, Platform } from 'react-native';

const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/**
 * Open the iOS subscription management screen.
 * - On iOS 15+, attempts the 'app-settings:' deep link to jump to the Settings app.
 * - On older iOS, falls back to the App Store subscriptions page.
 * - On Android/web, this is a no-op (see module-level NOTE).
 *
 * Errors from either iOS branch are swallowed — this is a fire-and-forget UX helper.
 */
export async function openSubscriptions(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  if (parseInt(String(Platform.Version), 10) >= 15) {
    try {
      await Linking.openURL('app-settings:');
      return;
    } catch {
      // Fall through to the App Store URL.
    }
  }
  await Linking.openURL(APPLE_SUBSCRIPTIONS_URL).catch(() => {});
}
