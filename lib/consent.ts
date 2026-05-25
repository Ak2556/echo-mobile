/**
 * Analytics consent state.
 *
 * Echo asks for explicit, GDPR-style consent before initialising PostHog.
 * The choice is persisted to MMKV via `store/persist`. If MMKV cannot load
 * in a dev-client/simulator build, AsyncStorage mirrors the value so it still
 * survives app restarts.
 *
 * Three states:
 *   - 'accepted'  → safe to call initAnalytics()
 *   - 'declined'  → never initialise analytics
 *   - 'unknown'   → first-launch; show the ConsentBanner
 */

import { persistGet, persistSet } from '../store/persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConsentStatus = 'accepted' | 'declined' | 'unknown';

const STORAGE_KEY = process.env.EXPO_PUBLIC_ANALYTICS_CONSENT_KEY ?? 'echo_analytics_consent';

function normalizeConsent(value: unknown): ConsentStatus {
  return value === 'accepted' || value === 'declined' ? value : 'unknown';
}

export function getAnalyticsConsent(): ConsentStatus {
  const value = persistGet<ConsentStatus | null>(STORAGE_KEY, null);
  return normalizeConsent(value);
}

export async function getAnalyticsConsentAsync(): Promise<ConsentStatus> {
  const syncValue = getAnalyticsConsent();
  if (syncValue !== 'unknown') return syncValue;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const asyncValue = normalizeConsent(parsed);
    if (asyncValue !== 'unknown') persistSet(STORAGE_KEY, asyncValue);
    return asyncValue;
  } catch {
    return 'unknown';
  }
}

export function setAnalyticsConsent(status: 'accepted' | 'declined'): void {
  persistSet(STORAGE_KEY, status);
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status)).catch(() => undefined);
}

export async function setAnalyticsConsentAsync(status: 'accepted' | 'declined'): Promise<void> {
  persistSet(STORAGE_KEY, status);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // MMKV/in-memory value above still resolves consent for this launch.
  }
}

export function hasResolvedAnalyticsConsent(): boolean {
  return getAnalyticsConsent() !== 'unknown';
}
