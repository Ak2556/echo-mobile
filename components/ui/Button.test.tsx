import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({
    colors: { accent: '#7A8B4E', onAccent: '#FFFFFF', surfaceHover: '#eee', text: '#111', textSecondary: '#555', danger: '#DC2626', border: '#ddd' },
    font: { bodyBold: {} },
    fontSizes: { small: 13, body: 16 },
  }),
}));

// The real pressable pulls in the store and haptics; what matters here is what Button hands it.
vi.mock('./AnimatedPressable', () => ({
  AnimatedPressable: ({ children, onPress, disabled, accessibilityLabel }: any) => (
    <button type="button" onClick={onPress} disabled={disabled} aria-label={accessibilityLabel}>{children}</button>
  ),
}));

import { Button } from './Button';

const noop = vi.fn();

describe('Button', () => {
  it('calls onPress', () => {
    const onPress = vi.fn();
    const { getByLabelText } = render(<Button label="Save" onPress={onPress} />);
    fireEvent.click(getByLabelText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while loading', () => {
    const onPress = vi.fn();
    const { getByLabelText } = render(<Button label="Save" onPress={onPress} loading />);
    fireEvent.click(getByLabelText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = vi.fn();
    const { getByLabelText } = render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.click(getByLabelText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('names itself with the label unless told otherwise', () => {
    const a = render(<Button label="Save" onPress={noop} />);
    expect(a.getByLabelText('Save')).toBeTruthy();
    const b = render(<Button label="Save" accessibilityLabel="Save profile" onPress={noop} />);
    expect(b.getByLabelText('Save profile')).toBeTruthy();
  });

  it('hides the label behind a spinner while loading', () => {
    const { queryByText } = render(<Button label="Save" onPress={noop} loading />);
    expect(queryByText('Save')).toBeNull();
  });

  it('shows the label otherwise', () => {
    const { getByText } = render(<Button label="Save" onPress={noop} />);
    expect(getByText('Save')).toBeTruthy();
  });
});
