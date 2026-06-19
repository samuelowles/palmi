/**
 * Palmi — App Configuration
 */

export const Config = {
  // API
  apiBaseUrl: __DEV__
    ? 'http://localhost:8787'
    : 'https://palmi-api.two-hoots-design.workers.dev',

  // RevenueCat
  revenueCatApiKey: process.env.EXPO_PUBLIC_RC_API_KEY || '',
  productId: 'palmi_pro_weekly',
  entitlementId: 'pro',

  // Feature flags
  enablePushNotifications: true,
  enableAnalytics: !__DEV__,

  // Limits
  maxImageWidth: 1024,
  maxImageSizeMB: 5,

  // Deep links
  scheme: 'palmi',
  webUrl: 'https://getpalmi.com',

  // Sharing
  appStoreUrl: 'https://apps.apple.com/app/palmi/id0000000000', // Update after launch
  shareHashtags: '#palmreading #palmi #astrology #compatibility #storytime',
} as const;

/** Centralized pricing strings — change here to A/B test */
export const Pricing = {
  weeklyPrice: '$1.99',
  trialDays: '3',
  trialCopy: 'Free for 3 days',
  priceCopy: '$1.99/week',
  coffeeFrame: 'less than a coffee per week',
  legalAutoRenew:
    'Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period.',
} as const;
