import * as React from 'react';
import { View } from 'react-native';

/**
 * react-native-gesture-handler stub for vitest.
 *
 * The package's commonjs build ships untranspiled TS (`typeof` used as a type
 * position) that neither Node nor Vite's transform will parse, so anything
 * that imports `Gesture`/`GestureDetector` at module scope — Toast.tsx,
 * GestureCard.tsx, FlowCard.tsx, etc. — fails to load under vitest at all,
 * in both the `logic` and `ui` projects. This mirrors the existing
 * react-native-reanimated stub: gesture builders collapse to inert chainable
 * objects, and GestureDetector/GestureHandlerRootView/Swipeable just render
 * their children. Nothing here simulates real touch/pan input — a test that
 * needs that belongs on a device.
 */

function chainableGesture(): unknown {
  const handlers: Record<string, unknown> = {};
  const target = function () {} as unknown as Record<string, unknown>;
  return new Proxy(target, {
    get: (_t, prop: string) => {
      if (prop === '__handlers') return handlers;
      return (...args: unknown[]) => {
        if (args.length === 1 && typeof args[0] === 'function') {
          handlers[prop] = args[0];
        }
        return chainableGesture();
      };
    },
    apply: () => chainableGesture(),
  });
}

export const Gesture = {
  Pan: () => chainableGesture(),
  Tap: () => chainableGesture(),
  LongPress: () => chainableGesture(),
  Pinch: () => chainableGesture(),
  Rotation: () => chainableGesture(),
  Fling: () => chainableGesture(),
  Race: (..._gestures: unknown[]) => chainableGesture(),
  Simultaneous: (..._gestures: unknown[]) => chainableGesture(),
  Exclusive: (..._gestures: unknown[]) => chainableGesture(),
};

export function GestureDetector({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

export function GestureHandlerRootView(props: Record<string, unknown>) {
  return React.createElement(View, props);
}

export function Swipeable(props: Record<string, unknown>) {
  const { children, ...rest } = props;
  return React.createElement(View, rest, children as React.ReactNode);
}

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
} as const;

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
} as const;

export default {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  Swipeable,
  State,
  Directions,
};
