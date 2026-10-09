import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({ colors: { textMuted: '#888' }, font: { eyebrow: {} } }),
}));

import { CollapsibleSection } from './CollapsibleSection';

function setup(open: boolean, onToggle = vi.fn()) {
  const utils = render(
    <CollapsibleSection title="Measurements" summary="Last logged Jul 19" open={open} onToggle={onToggle} action={<button>+ Log</button>}>
      <div>the content</div>
    </CollapsibleSection>,
  );
  return { ...utils, onToggle };
}

describe('CollapsibleSection', () => {
  it('closed: shows the title and summary, hides the content, keeps the action', () => {
    const { queryByText } = setup(false);
    expect(queryByText('Measurements')).not.toBeNull();
    expect(queryByText('Last logged Jul 19')).not.toBeNull();
    expect(queryByText('+ Log')).not.toBeNull();
    expect(queryByText('the content')).toBeNull();
  });

  it('open: shows the content and drops the summary, which the content now says', () => {
    const { queryByText } = setup(true);
    expect(queryByText('the content')).not.toBeNull();
    expect(queryByText('Last logged Jul 19')).toBeNull();
  });

  it('the toggle is one labelled button, with the action beside it and not inside it', () => {
    const { getByLabelText } = setup(false);
    const toggle = getByLabelText('Measurements. Last logged Jul 19');
    expect(toggle.tagName).toBe('BUTTON');
    // The action is a sibling, never inside the toggle: no button within a button.
    expect(toggle.querySelector('button')).toBeNull();
  });

  it('the caret points down when closed and up when open', () => {
    expect(setup(false).container.querySelector('[data-testid*="caret-down"]')).not.toBeNull();
    expect(setup(true).container.querySelector('[data-testid*="caret-up"]')).not.toBeNull();
  });

  it('reports its expanded state to a screen reader (react-native-web here does not draw it as aria-expanded)', () => {
    const source = readFileSync('components/mini-apps/CollapsibleSection.tsx', 'utf8');
    expect(source).toMatch(/accessibilityState=\{\{ expanded: open \}\}/);
    expect(source).toMatch(/accessibilityRole="button"/);
  });

  it('leaves a gap below its content, so an open section does not touch what follows', () => {
    // Seen on the emulator: the open monthly log sat flush against the panel under it.
    const source = readFileSync('components/mini-apps/CollapsibleSection.tsx', 'utf8');
    expect(source).toMatch(/open \? <View style=\{\{ marginTop: 2, marginBottom: 12 \}\}>/);
  });

  it('tapping the header asks to toggle', () => {
    const { getByLabelText, onToggle } = setup(false);
    fireEvent.click(getByLabelText('Measurements. Last logged Jul 19'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
