import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * expo-glass-effect stub for the `ui` vitest project.
 *
 * Two reasons this cannot be the real module. Its build ships JSX inside .js
 * files, which Vite will not parse; and `GlassView.ios.js` calls
 * `requireNativeViewManager` at module load, which reaches for the Expo native
 * runtime and throws under jsdom.
 *
 * `isLiquidGlassAvailable` returns false here on purpose: that is the branch every
 * non-iOS-26 device takes, so the tests exercise the fallback the overwhelming
 * majority of users actually see.
 */
export type GlassStyle = 'clear' | 'regular' | 'none';
export type GlassColorScheme = 'auto' | 'light' | 'dark';

export interface GlassViewProps extends ViewProps {
  glassEffectStyle?: GlassStyle | { style: GlassStyle };
  tintColor?: string;
  isInteractive?: boolean;
  colorScheme?: GlassColorScheme;
}

export const GlassView = React.forwardRef<unknown, GlassViewProps>(
  ({ glassEffectStyle, tintColor, isInteractive: _i, colorScheme, children, ...rest }, ref) =>
    React.createElement(
      View,
      {
        ...rest,
        ref,
        'data-glass-style': typeof glassEffectStyle === 'string' ? glassEffectStyle : glassEffectStyle?.style,
        'data-glass-tint': tintColor,
        'data-glass-scheme': colorScheme,
      } as never,
      children,
    ),
);
GlassView.displayName = 'GlassView(Stub)';

export const GlassContainer = React.forwardRef<unknown, ViewProps & { spacing?: number }>(
  ({ spacing: _s, children, ...rest }, ref) =>
    React.createElement(View, { ...rest, ref } as never, children),
);
GlassContainer.displayName = 'GlassContainer(Stub)';

export function isLiquidGlassAvailable(): boolean {
  return false;
}

export function isGlassEffectAPIAvailable(): boolean {
  return false;
}

export default { GlassView, GlassContainer, isLiquidGlassAvailable, isGlassEffectAPIAvailable };
