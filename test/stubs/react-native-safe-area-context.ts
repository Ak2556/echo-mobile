import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * react-native-safe-area-context stub for the `ui` vitest project.
 *
 * The published commonjs build ships untranspiled .tsx, so Vite fails on the
 * first `typeof` type annotation it meets. Insets have no meaning in jsdom, so
 * SafeAreaView renders as a plain View and the hooks return zero insets — which
 * is what a component under test should handle anyway.
 */

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const useSafeAreaInsets = (): EdgeInsets => ZERO_INSETS;

export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });

export const initialWindowMetrics = { insets: ZERO_INSETS, frame: { x: 0, y: 0, width: 390, height: 844 } };

export interface SafeAreaViewProps extends ViewProps {
  edges?: readonly string[];
  mode?: 'padding' | 'margin';
}

export const SafeAreaView = React.forwardRef<unknown, SafeAreaViewProps>(
  ({ edges: _edges, mode: _mode, children, ...rest }, ref) =>
    React.createElement(View, { ...rest, ref } as never, children),
);
SafeAreaView.displayName = 'SafeAreaView(Stub)';

export const SafeAreaProvider = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const SafeAreaInsetsContext = React.createContext<EdgeInsets | null>(ZERO_INSETS);

export default { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics };
