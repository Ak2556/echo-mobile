import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

// On the full-bleed video tab the bar was a pale slab across the picture: the
// theme's white wash over video. It now goes dark with white icons there.
describe('Reverb footer', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const glass = read('components/ui/EdgeGlass.tsx');

  it('the tab bar goes dark and white-iconed on the video tab only', () => {
    expect(layout).toMatch(/const onVideoTab = state\.routes\[state\.index\]\.name === 'watch'/);
    expect(layout).toMatch(/tone=\{onVideoTab \? 'dark' : 'auto'\}/);
    expect(layout).toMatch(/const activeTint = onVideoTab \? ON_MEDIA : colors\.accent/);
  });

  it("EdgeGlass's dark tone forces a black base, the dark glass scheme and the dark wash", () => {
    expect(glass).toMatch(/const dark = tone === 'dark' \|\| colors\.isDark/);
    expect(glass).toMatch(/tone === 'dark' \? '#000000'/);
    expect(glass).toMatch(/glassWash\(edge, Boolean\(NativeGlass \|\| blurs\), dark\)/);
    expect(glass).toMatch(/colorScheme=\{dark \? 'dark' : 'light'\}/);
  });
});
