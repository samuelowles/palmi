/**
 * Paywall copy map — keyed by the `source` query param sent from each
 * paywall trigger point (issue #38). Pure data so it can be unit tested
 * without pulling in react-native.
 */

export type PaywallSource = 'life-line' | 'compare' | 'history';

export const PAYWALL_COPY: Record<PaywallSource, { title: string; subtitle: string }> = {
  'life-line': {
    title: 'Your Life Line Has Something to Say',
    subtitle: "Most people are scared to see this part",
  },
  compare: {
    title: 'Pro members only',
    subtitle: 'Compare palms with a bestie on Palmi Pro',
  },
  history: {
    title: 'See your reading history',
    subtitle: 'Track how your lines change over time on Palmi Pro',
  },
};

const FALLBACK: PaywallSource = 'life-line';

export function paywallCopyFor(source: string | undefined | null): { title: string; subtitle: string } {
  if (source && source in PAYWALL_COPY) {
    return PAYWALL_COPY[source as PaywallSource];
  }
  return PAYWALL_COPY[FALLBACK];
}

export function isPaywallSource(value: unknown): value is PaywallSource {
  return typeof value === 'string' && value in PAYWALL_COPY;
}