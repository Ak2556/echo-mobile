import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mono palette, 2026-11-28: the theme's own accent (white on dark, black on
// light) is the default; tool icons share one neutral plate; no orange gradient.
const read = (p: string) => readFileSync(p, 'utf8');

const store = new Map<string, unknown>();
vi.mock('../store/persist', () => ({
  persistGet: (k: string, d: unknown) => (store.has(k) ? store.get(k) : d),
  persistSet: (k: string, v: unknown) => { store.set(k, v); },
  storage: {},
}));

describe('default accent', () => {
  beforeEach(() => { store.clear(); vi.resetModules(); });
  const load = async () => (await import('../store/slices/settingsSlice')).getAccentColor();

  it('is empty (the theme accent) on a fresh install', async () => {
    expect(await load()).toBe('');
  });

  it('moves the former olive and ember defaults to the theme accent once', async () => {
    store.set('accentColor', '#7A8B4E');
    expect(await load()).toBe('');
    store.clear(); vi.resetModules();
    store.set('accentColor', '#e06030');
    expect(await load()).toBe('');
  });

  it('keeps an accent someone picked that was never a default', async () => {
    store.set('accentColor', '#6E5E8B');
    expect(await load()).toBe('#6E5E8B');
  });
});

describe('Mono surfaces', () => {
  it('tool icons use one neutral plate, not a per-tool gradient', () => {
    const icon = read('components/mini-apps/MiniAppIcon.tsx');
    expect(icon).not.toMatch(/LinearGradient/);
    expect(icon).toMatch(/backgroundColor: colors\.surfaceHover/);
  });

  it('the Daily Question and next-step cards on Home have no orange gradient', () => {
    expect(read('app/(tabs)/home.tsx')).not.toMatch(/BRAND\.emberFrom/);
  });

  it('buttons on the accent never hard-code white text (white accent = invisible)', () => {
    for (const f of [
      'components/common/ErrorState.tsx', 'components/ai/SessionsDrawer.tsx', 'components/ai/ToolCallCard.tsx',
      'components/consent/ConsentSheet.tsx', 'components/feed/AltTextSheet.tsx', 'components/feed/FollowingEmptyState.tsx',
      'components/onboarding/DateOfBirthGate.tsx', 'components/tutorial/TutorialOverlay.tsx', 'components/ConsentBanner.tsx',
      'components/auth/ReviewerSignInSheet.tsx',
    ]) {
      expect(read(f), f).toMatch(/colors\.onAccent/);
    }
    expect(read('components/ai/MessageBubble.tsx')).not.toMatch(/isUser \? '#fff'/);
  });
});

describe('text on an accent fill picks black or white by contrast', () => {
  it('shared chips, buttons and the solid icon button do not hard-code white', () => {
    const kit = read('components/mini-apps/MiniKit.tsx');
    expect(kit).not.toMatch(/active \? '#fff'/);
    expect(kit).not.toMatch(/filled \? '#fff'/);
    expect(read('components/ui/IconButton.tsx')).toMatch(/variant === 'solid' \? \(tint \? '#fff' : colors\.onAccent\)/);
    expect(read('components/ui/Polish.tsx')).not.toMatch(/active \? '#fff'/);
    expect(read('components/ai/ChatInput.tsx')).not.toMatch(/canSend \? '#fff'/);
  });
});

describe('navigation', () => {
  it('draws the open tab filled and the rest as outlines (phone tab bar and side rail)', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    expect(layout).not.toMatch(/<IconComp color=\{color\} size=\{(18|iconSize)\} weight="regular" \/>/);
    expect(layout.match(/weight=\{isFocused \? 'fill' : 'regular'\}/g)?.length).toBe(5);
  });
});
