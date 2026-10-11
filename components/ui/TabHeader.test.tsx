import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../lib/ui/theme', () => ({
  useTheme: () => ({ colors: { text: '#111', textMuted: '#777' }, font: { displayBlack: {} } }),
}));
vi.mock('../../lib/ui/responsive', () => ({
  useResponsiveLayout: () => ({ isPhone: true }),
}));

import { TabHeader } from './TabHeader';

describe('TabHeader', () => {
  it('shows the title and the subtitle', () => {
    const { getByText } = render(<TabHeader title="Tools" subtitle="12 connected essentials" />);
    expect(getByText('Tools')).toBeTruthy();
    expect(getByText('12 connected essentials')).toBeTruthy();
  });

  it('omits the subtitle when there is none', () => {
    const { queryByText } = render(<TabHeader title="Explore" />);
    expect(queryByText('12 connected essentials')).toBeNull();
  });

  it('renders the right-hand controls', () => {
    const { getByText } = render(<TabHeader title="Explore" right={<span>ctl</span>} />);
    expect(getByText('ctl')).toBeTruthy();
  });
});
