/**
 * Sheets differ in what is inside them, not in how they arrive. Tasks and Shopping List each
 * rebuilt the scrim, the slide and the safe area by hand, in different colours and durations;
 * the action list and the edit-message box rebuilt a third and a fourth. BottomSheet is the one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const ON_BOTTOM_SHEET = [
  'components/common/ActionSheet.tsx',
  'components/ai/EditMessageModal.tsx',
  'app/mini-apps/tasks.tsx',
  'app/mini-apps/shopping-list.tsx',
];

describe('BottomSheet', () => {
  it.each(ON_BOTTOM_SHEET)('%s uses it', (file) => {
    expect(read(file)).toContain('<BottomSheet');
  });

  it('the action list and the edit box no longer build their own slide-in', () => {
    for (const file of ['components/common/ActionSheet.tsx', 'components/ai/EditMessageModal.tsx']) {
      expect(read(file), file).not.toContain('SlideInDown');
    }
  });

  it('Tasks and Shopping List no longer hand-build their add sheets', () => {
    expect(read('app/mini-apps/tasks.tsx')).not.toContain('{showAddSheet && (');
    const shop = read('app/mini-apps/shopping-list.tsx');
    expect(shop).not.toContain('{isAdding && (');
    expect(shop).not.toMatch(/<Modal visible=\{showListSelector\}/);
  });

  it('the shell owns the scrim, the slide and the safe area', () => {
    const src = read('components/common/BottomSheet.tsx');
    expect(src).toContain('SlideInDown');
    expect(src).toContain('FadeIn');
    expect(src).toContain('useSafeAreaInsets');
    expect(src).toContain('onRequestClose={onClose}');
  });
});
