/**
 * Analytics consent state.
 *
 * Echo asks for explicit, GDPR-style consent before initialising PostHog.
 * The choice is persisted to MMKV (or the in-memory fallback in Expo Go)
 * via `store/persist` so it survives app restarts.
 *
 * Three states:
 *   - 'accepted'  → safe to call initAnalytics()
 *   - 'declined'  → never initialise analytics
 *   - 'unknown'   → first-launch; show the ConsentBanner
 */

import { persistGet, persistSet } from '../store/persist';

export type ConsentStatus = 'accepted' | 'declined' | 'unknown';

const STORAGE_KEY = process.env.EXPO_PUBLIC_ANALYTICS_CONSENT_KEY ?? 'echo_analytics_consent';

export function getAnalyticsConsent(): ConsentStatus {
  const value = persistGet<ConsentStatus | null>(STORAGE_KEY, null);
  if (value === 'accepted' || value === 'declined') return value;
  return 'unknown';
}

export function setAnalyticsConsent(status: 'accepted' | 'declined'): void {
  persistSet(STORAGE_KEY, status);
}

export function hasResolvedAnalyticsConsent(): boolean {
  return getAnalyticsConsent() !== 'unknown';
}
