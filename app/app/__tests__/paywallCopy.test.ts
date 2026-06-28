import { describe, it, expect } from 'vitest';
import { PAYWALL_COPY, paywallCopyFor, isPaywallSource } from '../paywallCopy';
import { PAYWALL_ROUTE, PAYWALL_SOURCE } from '../paywallSource';

describe('paywallCopy — issue #38 trigger points', () => {
  it('returns "Unlock your Life Line" copy for life-line source', () => {
    const copy = paywallCopyFor('life-line');
    expect(copy.title).toBe('Your Life Line Has Something to Say');
    expect(copy.subtitle).toMatch(/scared/i);
  });

  it('returns "Pro members only" copy for compare source', () => {
    const copy = paywallCopyFor('compare');
    expect(copy.title).toBe('Pro members only');
    expect(copy.subtitle).toMatch(/pro/i);
  });

  it('returns "See your reading history" copy for history source', () => {
    const copy = paywallCopyFor('history');
    expect(copy.title).toBe('See your reading history');
    expect(copy.subtitle).toMatch(/history|track|change/i);
  });

  it('falls back to the life-line copy when source is missing', () => {
    expect(paywallCopyFor(undefined)).toEqual(PAYWALL_COPY['life-line']);
    expect(paywallCopyFor(null)).toEqual(PAYWALL_COPY['life-line']);
    expect(paywallCopyFor('')).toEqual(PAYWALL_COPY['life-line']);
  });

  it('falls back to the life-line copy when source is unknown', () => {
    expect(paywallCopyFor('not-a-real-source')).toEqual(PAYWALL_COPY['life-line']);
  });

  it('isPaywallSource recognises the three PRD trigger sources', () => {
    expect(isPaywallSource('life-line')).toBe(true);
    expect(isPaywallSource('compare')).toBe(true);
    expect(isPaywallSource('history')).toBe(true);
  });

  it('isPaywallSource rejects unknown values', () => {
    expect(isPaywallSource('unknown')).toBe(false);
    expect(isPaywallSource(undefined)).toBe(false);
    expect(isPaywallSource(null)).toBe(false);
    expect(isPaywallSource(42)).toBe(false);
  });

  // ---- Trigger point route constants --------------------------------------
  //
  // Each screen pushes one of these routes. The test guards the contract
  // between the source string and the PRD copy label, so a rename in one
  // place will fail fast.

  it('trigger #1 — life-line route resolves to "Unlock your Life Line" copy', () => {
    expect(PAYWALL_ROUTE.lifeLine).toBe(`/paywall?source=${PAYWALL_SOURCE.lifeLine}`);
    const source = PAYWALL_ROUTE.lifeLine.split('source=')[1];
    expect(paywallCopyFor(source).title).toBe('Your Life Line Has Something to Say');
  });

  it('trigger #2 — compare route resolves to "Pro members only" copy', () => {
    expect(PAYWALL_ROUTE.compare).toBe(`/paywall?source=${PAYWALL_SOURCE.compare}`);
    const source = PAYWALL_ROUTE.compare.split('source=')[1];
    expect(paywallCopyFor(source).title).toBe('Pro members only');
  });

  it('trigger #3 — history route resolves to "See your reading history" copy', () => {
    expect(PAYWALL_ROUTE.history).toBe(`/paywall?source=${PAYWALL_SOURCE.history}`);
    const source = PAYWALL_ROUTE.history.split('source=')[1];
    expect(paywallCopyFor(source).title).toBe('See your reading history');
  });

  it('all three PRD §4 trigger sources are mapped to distinct copy', () => {
    const titles = ['life-line', 'compare', 'history'].map((s) => paywallCopyFor(s).title);
    expect(new Set(titles).size).toBe(3);
  });
});