import * as React from 'react';
import { View, Text, ScrollView, Image, FlatList } from 'react-native';

/**
 * Reanimated stub for the `ui` vitest project.
 *
 * Reanimated 4 loads react-native-worklets at import time, which reaches for the
 * native TurboModule registry and throws under jsdom. Ninety-five files import
 * Reanimated, so without this no component test can mount anything real.
 *
 * The shims run animation callbacks eagerly and return their final value: a test
 * sees the settled state rather than a frame of the transition, which is what
 * assertions actually want. Nothing here simulates timing — if a test needs to
 * observe motion, that belongs on a device, not in jsdom.
 */

export const useSharedValue = <T,>(initial: T) => ({ value: initial });

export const useDerivedValue = <T,>(fn: () => T) => {
  try {
    return { value: fn() };
  } catch {
    return { value: undefined as unknown as T };
  }
};

export const useAnimatedStyle = (fn: () => object) => {
  try {
    return fn();
  } catch {
    return {};
  }
};

export const useAnimatedProps = (fn: () => object) => {
  try {
    return fn();
  } catch {
    return {};
  }
};

// Animation builders collapse to their target value.
export const withTiming = <T,>(v: T) => v;
export const withSpring = <T,>(v: T) => v;
export const withDecay = <T,>(v: T) => v;
export const withDelay = <T,>(_ms: number, v: T) => v;
export const withRepeat = <T,>(v: T) => v;
export const withSequence = <T,>(...steps: T[]) => steps[steps.length - 1];
export const cancelAnimation = () => {};

export const interpolate = (_x: number, _input: number[], output: number[]) => output[0] ?? 0;
export const interpolateColor = (_x: number, _input: number[], output: unknown[]) => output[0];

export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A) =>
    fn(...args);
export const runOnUI = runOnJS;

export const useAnimatedReaction = () => {};
export const useAnimatedScrollHandler = () => () => {};
export const useAnimatedRef = () => ({ current: null });
export const measure = () => null;
export const useFrameCallback = () => ({ setActive: () => {} });

export const SensorType = {
  ACCELEROMETER: 1,
  GYROSCOPE: 2,
  GRAVITY: 3,
  MAGNETIC_FIELD: 4,
  ROTATION: 5,
} as const;

export const useAnimatedSensor = () => ({
  sensor: { value: { pitch: 0, roll: 0, yaw: 0, qw: 0, qx: 0, qy: 0, qz: 0 } },
  unregister: () => {},
  isAvailable: false,
  config: {},
});

export const Easing = new Proxy(
  {},
  { get: () => (x: number) => x },
) as Record<string, (x: number) => number>;

export const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

/**
 * Layout animations are used as chained builders
 * (`FadeInDown.delay(100).duration(400).springify().mass(0.7)`), so every method
 * has to return something chainable and the terminal value must be inert.
 */
function chainable(): unknown {
  const target = function () {} as unknown as Record<string, unknown>;
  return new Proxy(target, {
    get: (_t, prop) => {
      if (prop === 'build') return () => () => ({ initialValues: {}, animations: {} });
      return () => chainable();
    },
    apply: () => chainable(),
  });
}

const layoutAnimations = new Proxy({} as Record<string, unknown>, {
  get: () => chainable(),
});

export const FadeIn = layoutAnimations.FadeIn;
export const FadeOut = layoutAnimations.FadeOut;
export const FadeInDown = layoutAnimations.FadeInDown;
export const FadeInUp = layoutAnimations.FadeInUp;
export const FadeOutDown = layoutAnimations.FadeOutDown;
export const FadeOutUp = layoutAnimations.FadeOutUp;
export const SlideInDown = layoutAnimations.SlideInDown;
export const SlideOutDown = layoutAnimations.SlideOutDown;
export const SlideInRight = layoutAnimations.SlideInRight;
export const SlideOutLeft = layoutAnimations.SlideOutLeft;
export const ZoomIn = layoutAnimations.ZoomIn;
export const ZoomOut = layoutAnimations.ZoomOut;
export const Layout = layoutAnimations.Layout;
export const LinearTransition = layoutAnimations.LinearTransition;
export const CurvedTransition = layoutAnimations.CurvedTransition;

/**
 * Strip the animation-only props before handing off to the plain RN component, so
 * react-native-web does not warn about unknown DOM attributes.
 */
function createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
  const Wrapped = React.forwardRef<unknown, P & Record<string, unknown>>((props, ref) => {
    const {
      entering: _entering,
      exiting: _exiting,
      layout: _layout,
      animatedProps,
      sharedTransitionTag: _tag,
      ...rest
    } = props as Record<string, unknown>;
    return React.createElement(
      Component as React.ComponentType<Record<string, unknown>>,
      { ...rest, ...((animatedProps as object) ?? {}), ref },
    );
  });
  Wrapped.displayName = 'Animated(Stub)';
  return Wrapped;
}

const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  ScrollView: createAnimatedComponent(ScrollView),
  Image: createAnimatedComponent(Image),
  FlatList: createAnimatedComponent(FlatList as never),
  createAnimatedComponent,
};

export { createAnimatedComponent };
export default Animated;
