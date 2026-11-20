import { act, render } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const { create } = require('zustand') as typeof import('zustand');
  return create<{ appLanguage: string }>(() => ({ appLanguage: 'en' }));
});
vi.mock('../../store/useAppStore', () => ({ useAppStore: store }));

import { LanguageScope, remountOnLanguageChange } from './languageScope';

// Stands in for a screen whose labels come from ttx(): under the React Compiler
// each ttx('literal') is computed once per mount and cached, exactly like this
// useState initializer, so only a remount picks up a new language.
let mounts = 0;
function Screen() {
  const [label] = useState(() => { mounts += 1; return `label in ${store.getState().appLanguage}`; });
  return <span>{label}</span>;
}

beforeEach(() => {
  mounts = 0;
  store.setState({ appLanguage: 'hi' });
});

describe('LanguageScope', () => {
  it('remounts its children when the app language changes, so cached labels follow', () => {
    const { getByText } = render(<LanguageScope><Screen /></LanguageScope>);
    expect(getByText('label in hi')).toBeTruthy();
    act(() => store.setState({ appLanguage: 'en' }));
    expect(getByText('label in en')).toBeTruthy();
    expect(mounts).toBe(2);
  });

  it('leaves its children alone while the language stays the same', () => {
    const { rerender } = render(<LanguageScope><Screen /></LanguageScope>);
    rerender(<LanguageScope><Screen /></LanguageScope>);
    act(() => store.setState({ appLanguage: 'hi' }));
    expect(mounts).toBe(1);
  });
});

describe('remountOnLanguageChange', () => {
  const route = (name: string) => ({ route: { name }, children: <Screen /> });

  it('wraps a leaf screen so it remounts on a language change', () => {
    const layout = remountOnLanguageChange();
    const { getByText } = render(layout(route('settings')));
    act(() => store.setState({ appLanguage: 'en' }));
    expect(getByText('label in en')).toBeTruthy();
  });

  it('does not remount a kept route: a nested navigator would lose its state, a form its input', () => {
    const layout = remountOnLanguageChange(new Set(['(tabs)']));
    const { getByText } = render(layout(route('(tabs)')));
    act(() => store.setState({ appLanguage: 'en' }));
    expect(getByText('label in hi')).toBeTruthy();
    expect(mounts).toBe(1);
  });
});
