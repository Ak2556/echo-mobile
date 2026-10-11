/**
 * The tops of the page-style tabs were drawn separately: Tools sat on a 20 pt gutter
 * while every other tab used the layout's 16, its title read "Echo Tools" under a tab
 * labelled "Tools", and its search box was a squarer, shorter field than Explore's pill.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const explore = read('app/(tabs)/explore.tsx');
const tools = read('app/(tabs)/apps.tsx');

describe('tab tops', () => {
  it('Explore and Tools draw their title through TabHeader', () => {
    expect(explore).toContain('<TabHeader');
    expect(tools).toContain('<TabHeader');
  });

  it('Tools is on the layout gutter, not a private 20 pt constant', () => {
    expect(tools).not.toMatch(/^const PAD = \d+/m);
    expect(tools).toMatch(/const PAD = layout\.gutter/);
  });

  it('the tab and its title use the same word', () => {
    expect(tools).not.toContain('Echo Tools');
    expect(tools).toMatch(/<TabHeader title=\{ttx\("Tools"\)\}/);
  });

  it('Tools uses the same search field as Explore', () => {
    expect(explore).toContain('<SearchBar');
    expect(tools).toContain('<SearchBar');
    expect(tools).not.toMatch(/<TextInput[^>]*placeholder=\{ttx\("Search tools/);
  });

  it('the shared title block fixes the type once', () => {
    const src = read('components/ui/TabHeader.tsx');
    expect(src).toContain('layout.isPhone ? 34 : 40');
    expect(src).toContain('layout.isPhone ? 38 : 44');
  });
});
