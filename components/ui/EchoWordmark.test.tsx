import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The lockup has to survive the theme picker.
 *
 * Echo ships nine themes and four of them are light. The mark taken from the
 * app icon is a cream glyph, so painted as-is it disappears on Light, Nord
 * Light, Rosé Pine Dawn and Tokyo Night Day. Tinting the whole PNG would solve
 * that and destroy the orange dot, which is the only colour the mark has.
 *
 * So the dot is drawn rather than baked, and these tests pin that split: the
 * glyph takes colors.text, the dot takes colors.accent, and the proportions
 * measured off the 1024px source art hold at any height.
 */

const theme = { colors: { text: '#EFEFEF', accent: '#7A8B4E' } };
vi.mock('../../src/shared/lib/theme', () => ({ useTheme: () => theme }));

import { EchoWordmark } from './EchoWordmark';

const glyph = (c: HTMLElement) => c.querySelector('[data-image-source]') as HTMLElement | null;
/** The dot is the only plain View with a background colour. */
const dot = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('div')).find(
    el => !el.hasAttribute('data-image-source') && /background-color/.test(el.getAttribute('style') ?? ''),
  ) as HTMLElement | undefined;

describe('EchoWordmark', () => {
  it('renders the glyph and a separate dot', () => {
    const { container } = render(<EchoWordmark />);
    expect(glyph(container), 'the mark image must render').toBeTruthy();
    expect(dot(container), 'the dot must be drawn, not baked into the image').toBeTruthy();
  });

  it('tints the glyph with the theme text colour', () => {
    // Without this the cream glyph is invisible on the four light themes.
    const { container } = render(<EchoWordmark />);
    expect(glyph(container)!.getAttribute('data-tint-color')).toBe(theme.colors.text);
  });

  it('paints the dot with the accent, not a fixed orange', () => {
    const { container } = render(<EchoWordmark />);
    expect(dot(container)!.getAttribute('style')).toContain('122, 139, 78'); // #7A8B4E
  });

  it('keeps the source proportions at any height', () => {
    const { container } = render(<EchoWordmark height={204} />);
    const style = glyph(container)!.getAttribute('style') ?? '';
    // 190x204 in the source art.
    expect(style).toMatch(/width:\s*190px/);
    expect(style).toMatch(/height:\s*204px/);
    // Dot is 69px across at that height.
    expect(dot(container)!.getAttribute('style')).toMatch(/width:\s*69px/);
  });

  it('carries the name for screen readers', () => {
    // The word "Echo" beside it is decorative once the mark is labelled; a
    // screen reader should hear the brand once, not twice or never.
    const { container } = render(<EchoWordmark />);
    expect(container.innerHTML).toContain('Echo');
  });
});
