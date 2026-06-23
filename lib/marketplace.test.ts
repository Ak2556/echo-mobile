import { describe, expect, it } from 'vitest';
import { buildMarketplaceMatches, MARKETPLACE_LISTINGS } from './marketplace';
import type { PersonaProfile } from './persona';

const persona: PersonaProfile = {
  enabled: true,
  startedAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-07T00:00:00Z',
  signals: [],
  userNote: '',
  traits: ['I prefer concrete build plans'],
  topics: ['ai', 'prototype'],
  values: ['learn and ship useful products'],
  responseStyle: [],
};

describe('marketplace matching', () => {
  it('ranks listings against interests and learned persona topics', () => {
    const matches = buildMarketplaceMatches(MARKETPLACE_LISTINGS, {
      interests: ['AI', 'startups'],
      persona,
      category: 'All',
    });

    expect(matches[0].id).toBe('m2');
    expect(matches[0].matchScore).toBeGreaterThan(matches[matches.length - 1].matchScore);
    expect(matches[0].matchReasons.length).toBeGreaterThan(0);
  });

  it('filters by category and query together', () => {
    const matches = buildMarketplaceMatches(MARKETPLACE_LISTINGS, {
      interests: ['design'],
      persona: null,
      category: 'Learning',
      query: 'figma',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('m4');
  });

  it('keeps a curated baseline when the user has no signals yet', () => {
    const matches = buildMarketplaceMatches(MARKETPLACE_LISTINGS, {
      interests: [],
      persona: null,
      category: 'All',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(match => match.matchScore >= 30)).toBe(true);
    expect(matches[0].matchReasons).toContain('Curated for first-time discovery');
  });
});
