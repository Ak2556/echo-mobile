/**
 * One place for "add": the top right of the header, the same button everywhere.
 * A floating "+" was drawn five different ways (60, 64, 48 px; accent, surface;
 * three corners of margin) and could sit on content or under the voice button.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const SHELL_SCREENS = ['habits', 'tasks', 'shopping-list', 'expenses', 'notes', 'world-clock', 'fitness', 'learn'];

describe('add lives in the header', () => {
  it.each(SHELL_SCREENS)('%s uses the shared header button', (name) => {
    expect(read(`app/mini-apps/${name}.tsx`)).toContain('<HeaderAddButton');
  });

  it.each(['habits', 'tasks', 'shopping-list', 'expenses'])('%s has no floating add button', (name) => {
    const src = read(`app/mini-apps/${name}.tsx`);
    expect(src).not.toMatch(/\{\/\*\s*(FAB|Floating Action Button)\s*\*\/\}/);
    // A 60-64px accent circle positioned over the content is the old FAB.
    expect(src).not.toMatch(/width:\s*6[04],\s*height:\s*6[04],\s*borderRadius:\s*radius\.full,\s*backgroundColor:\s*(colors\.)?accent/);
  });

  it('Home composes from its header and the floating compose button is gone', () => {
    const home = read('app/(tabs)/home.tsx');
    expect(home).toContain('<HeaderAddButton');
    expect(home).not.toContain('ComposeFAB');
    expect(existsSync(resolve(__dirname, '../components/ui/ComposeFAB.tsx'))).toBe(false);
  });

  it('the shared button is a labelled solid accent IconButton', () => {
    const src = read('components/ui/HeaderAddButton.tsx');
    expect(src).toContain('IconButton');
    expect(src).toContain('variant="solid"');
    expect(src).toMatch(/label=\{label \?\? /);
  });

  it('every add has a spoken label naming what it makes', () => {
    for (const name of ['habits', 'tasks', 'shopping-list', 'expenses', 'notes', 'fitness', 'learn']) {
      expect(read(`app/mini-apps/${name}.tsx`), name).toMatch(/<HeaderAddButton[\s\S]{0,200}?label=/);
    }
  });
});
