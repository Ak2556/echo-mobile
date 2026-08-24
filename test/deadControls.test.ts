import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * A labelled button that does nothing.
 *
 * The DM header shipped Phone and Video buttons with `onPress={() => {}}` —
 * they rendered, they were reachable, and pressing them did nothing at all.
 * That is an App Store guideline 2.1 completeness problem before it is a
 * usability one: a reviewer presses every control on the screen.
 *
 * Modal backdrops are a different thing and stay allowed. `<Pressable
 * onPress={() => {}}>` wrapping a sheet is the standard way to stop a tap
 * inside the sheet from closing it, so this only looks at components that
 * present themselves as buttons.
 */

const ROOT = resolve(__dirname, '..');
const UI_DIRS = ['app', 'components', 'src'];
const BUTTON_TAGS = ['IconButton', 'Button', 'PrimaryButton', 'LitePressable'];

function tsxFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    if (entry === 'node_modules') return [];
    const path = join(full, entry);
    if (statSync(path).isDirectory()) return tsxFiles(join(dir, entry));
    return entry.endsWith('.tsx') ? [path] : [];
  });
}

/** Button-like elements whose onPress body is empty. */
function deadControls(): string[] {
  const found: string[] = [];
  const empty = /onPress=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/;

  for (const file of UI_DIRS.flatMap(tsxFiles)) {
    const src = readFileSync(file, 'utf8');
    // Find each empty handler, then walk back to the tag that owns it. Matching
    // the element forward does not work: the `>` in `() =>` ends a naive
    // character class, which silently matched nothing at all.
    for (const match of src.matchAll(new RegExp(empty, 'g'))) {
      const before = src.slice(0, match.index);
      const openTag = before.lastIndexOf('<');
      if (openTag === -1) continue;
      const tag = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(before.slice(openTag))?.[1];
      if (!tag || !BUTTON_TAGS.includes(tag)) continue;
      const line = before.split('\n').length;
      found.push(`${file.slice(ROOT.length + 1)}:${line} <${tag}>`);
    }
  }
  return found;
}

describe('user-facing controls', () => {
  it('has no button that does nothing when pressed', () => {
    expect(deadControls(), 'a labelled control with an empty handler').toEqual([]);
  });
});
