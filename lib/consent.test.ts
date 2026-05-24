import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  hasResolvedAnalyticsConsent,
} from './consent';
import { storage } from '../store/persist';

// Force the in-memory storage path by failing the MMKV require.
vi.mock('react-native-mmkv', () => {
  throw new Error('not available in node tests');
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

describe('analytics consent', () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it('starts in the unknown state on a fresh install', () => {
    expect(getAnalyticsConsent()).toBe('unknown');
    expect(hasResolvedAnalyticsConsent()).toBe(false);
  });

  it('persists an accept choice', () => {
    setAnalyticsConsent('accepted');
    expect(getAnalyticsConsent()).toBe('accepted');
    expect(hasResolvedAnalyticsConsent()).toBe(true);
  });

  it('persists a decline choice', () => {
    setAnalyticsConsent('declined');
    expect(getAnalyticsConsent()).toBe('declined');
    expect(hasResolvedAnalyticsConsent()).toBe(true);
  });

  it('overwrites prior choices', () => {
    setAnalyticsConsent('accepted');
    setAnalyticsConsent('declined');
    expect(getAnalyticsConsent()).toBe('declined');
  });
});
