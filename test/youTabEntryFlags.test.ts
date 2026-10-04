import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The You tab's strip links to screens that sit behind a feature flag. A link
// whose flag is off lands on V2FeatureGuard, which redirects to Home: a button
// that does nothing. This guards the one that shipped that way.
describe('You tab entry points follow their feature flag', () => {
  const you = readFileSync('app/(tabs)/you.tsx', 'utf8');

  it('shows the Year in Echo icon only while yearInEcho is on', () => {
    expect(you).toMatch(/const yearInEchoOn = useFeature\('yearInEcho'\)/);
    const at = you.indexOf("router.push('/year-in-echo')");
    expect(at).toBeGreaterThan(-1);
    // The link is inside the conditional, not rendered unconditionally.
    expect(you.slice(Math.max(0, at - 400), at)).toMatch(/\{yearInEchoOn \? \(/);
  });

  it('the screen is still guarded by the same flag', () => {
    expect(readFileSync('app/year-in-echo.tsx', 'utf8')).toMatch(/<V2FeatureGuard flag="yearInEcho">/);
  });
});
