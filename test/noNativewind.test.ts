import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// 2026-11-27: NativeWind was removed. Its JSX runtime wrapped every Pressable,
// and in Release builds a `style={({ pressed }) => …}` function lost its layout:
// Activity's and Messages' filter chips rendered as bare text with the selected
// label black on black, the Tools grid lost its row padding, and 29 other places
// carried the same pattern. It was used for className in only 15 files.
describe('NativeWind stays out', () => {
  it('is not in the build config or dependencies', () => {
    expect(readFileSync('babel.config.js', 'utf8')).not.toMatch(/nativewind/);
    expect(readFileSync('metro.config.js', 'utf8')).not.toMatch(/nativewind/);
    expect(readFileSync('package.json', 'utf8')).not.toMatch(/"(nativewind|tailwindcss)"/);
  });

  it('no component uses className', () => {
    const hits = execSync("git grep -l 'className' -- 'app/*.tsx' 'components/*.tsx' ':!*.test.tsx' || true", { encoding: 'utf8' }).trim();
    expect(hits).toBe('');
  });
});
