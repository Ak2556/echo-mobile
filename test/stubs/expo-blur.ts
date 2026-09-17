import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * expo-blur stub for the `ui` vitest project.
 *
 * The published build ships JSX inside a .js file, which Vite refuses to parse.
 * A blur has no observable behaviour in jsdom anyway, so this renders a plain
 * View and keeps the props visible for assertions.
 */
export interface BlurViewProps extends ViewProps {
  intensity?: number;
  tint?: string;
  blurReductionFactor?: number;
  experimentalBlurMethod?: 'none' | 'dimezisBlurView';
}

export const BlurView = React.forwardRef<unknown, BlurViewProps>(
  ({ intensity, tint, blurReductionFactor: _f, experimentalBlurMethod: _m, children, ...rest }, ref) =>
    React.createElement(
      View,
      { ...rest, ref, 'data-blur-intensity': intensity, 'data-blur-tint': tint } as never,
      children,
    ),
);
BlurView.displayName = 'BlurView(Stub)';

export default { BlurView };
