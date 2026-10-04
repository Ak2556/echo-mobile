import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_TITLES } from '../supabase/functions/daily-question-push/copy';

// Pushes that go to people who did nothing to trigger them. The voice is dry
// and sarcastic, but every line has to be true for whoever receives it: Play's
// deceptive-notifications policy forbids invented social proof.
const INVENTED_SOCIAL_PROOF = /\b(someone|somebody) (is|has|just|wants|replied|viewed|messaged|liked)\b|\b(everyone|everybody|people are|group chat)\b|\bwaiting for your\b/i;

function surfaceLines(): string[] {
  const src = readFileSync('supabase/functions/personalized-fanout/index.ts', 'utf8');
  const block = src.slice(src.indexOf('const SURFACE_COPY'), src.indexOf('/** A user claimed for a nudge'));
  return [...block.matchAll(/^\s+"(.+)",$/gm)].map((m) => m[1]);
}

describe('unsolicited notification copy', () => {
  const surface = surfaceLines();

  it('finds the surface pool', () => {
    expect(surface.length).toBeGreaterThanOrEqual(15);
  });

  it('makes no claim about other people it cannot back up', () => {
    for (const line of [...surface, ...DAILY_TITLES]) {
      expect(line, line).not.toMatch(INVENTED_SOCIAL_PROOF);
    }
  });

  it('stays inside 16 words and carries no exclamation mark', () => {
    for (const line of surface) {
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(16);
      expect(line, line).not.toContain('!');
    }
  });

  it('keeps daily titles short enough for a lock screen', () => {
    for (const t of DAILY_TITLES) expect(t.length, t).toBeLessThanOrEqual(70);
  });
});
