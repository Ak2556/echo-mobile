import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({ colors: { surface: '#fff', border: '#ddd' }, radius: { xl: 24 }, reduceAnimations: true }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  it('draws nothing while closed', () => {
    const { queryByText } = render(<BottomSheet visible={false} onClose={vi.fn()}><span>body</span></BottomSheet>);
    expect(queryByText('body')).toBeNull();
  });

  it('draws its content while open', () => {
    const { getByText } = render(<BottomSheet visible onClose={vi.fn()}><span>body</span></BottomSheet>);
    expect(getByText('body')).toBeTruthy();
  });

  it('closes when the scrim is pressed', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<BottomSheet visible onClose={onClose}><span>body</span></BottomSheet>);
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws floating content too', () => {
    const { getByText } = render(<BottomSheet visible variant="floating" onClose={vi.fn()}><span>list</span></BottomSheet>);
    expect(getByText('list')).toBeTruthy();
  });
});
