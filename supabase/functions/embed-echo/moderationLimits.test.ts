import { describe, expect, it } from 'vitest';
import { MODERATION_TIMEOUT_MS, VISION_TIMEOUT_MS } from './moderationLimits';
import { VISIBILITY_SECONDS } from '../worker/policy';

// 2026-11-25: at 8 s the text check timed out on about 8% of calls (probe_runs,
// 19-25 Nov: p50 1.6 s, p95 6.4 s, successes up to 7.7 s), leaving those posts
// unpublished until a retry and spending a second call on each.
describe('moderation time limits', () => {
  it('gives the text check room past the measured tail', () => {
    expect(MODERATION_TIMEOUT_MS).toBe(15_000);
  });

  it('keeps the text check shorter than the image check, which carries whole images', () => {
    expect(MODERATION_TIMEOUT_MS).toBeLessThan(VISION_TIMEOUT_MS);
  });

  it('fits a text and an image verdict inside one worker claim, so a post is not judged twice at once', () => {
    expect(MODERATION_TIMEOUT_MS + VISION_TIMEOUT_MS).toBeLessThan(VISIBILITY_SECONDS * 1000);
  });
});
