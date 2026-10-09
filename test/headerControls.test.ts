/**
 * Header controls share one size. The right edge of a header held 34, 36, 38 and
 * 42 pt squares and circles drawn one screen at a time, and four screens kept their
 * own "+" (24 px bare, a grey chip, a labelled pill). The back button, the "+" and
 * every secondary action now come from one place each.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('add controls in the header', () => {
  it.each(['app/salons.tsx', 'app/office-hours.tsx', 'app/(tabs)/chat.tsx', 'app/mini-apps/marketplace.tsx'])(
    '%s uses the shared header "+"',
    (file) => {
      expect(read(file)).toContain('<HeaderAddButton');
    },
  );

  it('Chat keeps no private header button', () => {
    const chat = read('app/(tabs)/chat.tsx');
    expect(chat).not.toContain('HeaderIconButton');
    expect(chat).toContain('<HeaderActionButton');
  });

  it('the header "+" is the last control in Chat, at the top right', () => {
    const chat = read('app/(tabs)/chat.tsx');
    expect(chat.lastIndexOf('<HeaderAddButton')).toBeGreaterThan(chat.lastIndexOf('<HeaderActionButton'));
  });
});

describe('secondary header actions', () => {
  const SCREENS = [
    'app/mini-apps/pomodoro.tsx', 'app/mini-apps/expenses.tsx', 'app/mini-apps/fitness.tsx',
    'app/mini-apps/learn.tsx', 'app/mini-apps/bill-splitter.tsx', 'app/mini-apps/studio.tsx',
    'app/mini-apps/calculator.tsx', 'app/mini-apps/markdown.tsx', 'app/listing/[id].tsx',
  ];

  it.each(SCREENS)('%s uses HeaderActionButton, not a hand-sized square', (file) => {
    const src = read(file);
    expect(src).toContain('<HeaderActionButton');
    // The hand-drawn header chips were 34-38 pt squares passed to the shell or header.
    expect(src).not.toMatch(/const (ClearBtn|GalleryBtn|ShareBtn)\s*=\s*\(\s*<(Animated)?Pressable/);
  });

  it('both header buttons are the same 40 pt circle', () => {
    expect(read('components/ui/HeaderAddButton.tsx')).toContain('hitSize={40}');
    expect(read('components/ui/HeaderActionButton.tsx')).toContain('hitSize={40}');
  });

  it('every header action carries a spoken label', () => {
    for (const file of SCREENS) {
      expect(read(file), file).toMatch(/<HeaderActionButton[\s\S]{0,160}?label=/);
    }
  });
});
