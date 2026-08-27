import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { View, Text } from 'react-native';

/**
 * Proves the `ui` vitest project actually works: jsdom is present, the
 * react-native -> react-native-web alias resolves, and JSX compiles.
 *
 * Component tests were impossible before this project existed (the include glob
 * covered only `.test.ts`), so this guards the harness itself. If it fails, every
 * other component test is suspect for infrastructure reasons rather than real ones.
 */
describe('component test harness', () => {
  it('renders react-native primitives into the DOM', () => {
    render(
      <View>
        <Text>hello from react-native-web</Text>
      </View>,
    );
    expect(screen.getByText('hello from react-native-web')).toBeTruthy();
  });

  it('applies style props', () => {
    render(<Text style={{ color: 'rgb(163, 193, 101)' }}>tinted</Text>);
    expect(screen.getByText('tinted')).toHaveStyle({ color: 'rgb(163, 193, 101)' });
  });

  it('exposes accessibility props as ARIA', () => {
    render(<View accessibilityRole="button" accessibilityLabel="Like this echo" />);
    expect(screen.getByLabelText('Like this echo')).toBeTruthy();
  });

  it('has __DEV__ defined, as the app expects at import time', () => {
    expect(__DEV__).toBe(true);
  });
});
