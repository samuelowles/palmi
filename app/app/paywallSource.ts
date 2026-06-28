/**
 * Paywall source constants — issue #38 trigger points.
 *
 * These are the canonical source identifiers that each screen passes to the
 * paywall route (`/paywall?source=<SOURCE>`) so the paywall can render the
 * correct PRD §4 prompt copy.
 */

export const PAYWALL_SOURCE = {
  lifeLine: 'life-line',
  compare: 'compare',
  history: 'history',
} as const;

export const PAYWALL_ROUTE = {
  lifeLine: `/paywall?source=${PAYWALL_SOURCE.lifeLine}`,
  compare: `/paywall?source=${PAYWALL_SOURCE.compare}`,
  history: `/paywall?source=${PAYWALL_SOURCE.history}`,
} as const;