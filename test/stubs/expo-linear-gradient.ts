import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * expo-linear-gradient stub for the `ui` vitest project.
 *
 * Ships JSX inside a .js build file, which Vite will not parse. A gradient has no
 * observable behaviour in jsdom; this renders a plain View.
 */
export interface LinearGradientProps extends ViewProps {
  colors?: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: readonly number[];
}

export const LinearGradient = React.forwardRef<unknown, LinearGradientProps>(
  ({ colors: _c, start: _s, end: _e, locations: _l, children, ...rest }, ref) =>
    React.createElement(View, { ...rest, ref } as never, children),
);
LinearGradient.displayName = 'LinearGradient(Stub)';

export default { LinearGradient };
