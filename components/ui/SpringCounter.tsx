import React, { useEffect, useRef } from 'react';
import { Text, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useAppStore } from '../../store/useAppStore';
import { MOTION } from '../../lib/motion';

interface SpringCounterProps {
  value: number;
  style?: TextStyle;
  formatter?: (n: number) => string;
}

export function SpringCounter({ value, style, formatter }: SpringCounterProps) {
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (reduceAnimations || prev === value) return;

    const going = value > prev;
    scale.value = withSequence(
      withSpring(going ? 1.2 : 0.8, MOTION.pressFirm),
      withSpring(1, MOTION.overshoot)
    );
    translateY.value = withSequence(
      withSpring(going ? -4 : 4, MOTION.pressFirm),
      withSpring(0, MOTION.release)
    );
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const label = formatter ? formatter(value) : String(value);

  return (
    <Animated.View style={animStyle}>
      <Text style={style}>{label}</Text>
    </Animated.View>
  );
}
