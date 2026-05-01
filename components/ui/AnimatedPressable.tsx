import React, { useEffect, useRef } from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import { MOTION, PRESS_DEPTH, PressDepth } from '../../lib/motion';

const AnimatedPress = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  scaleValue?: number;
  depth?: PressDepth;
  fadeOnPress?: boolean;
  sinkOnPress?: boolean;
  dimWhenDisabled?: boolean;
  tilt3D?: boolean;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  className?: string;
  style?: any;
}

export function AnimatedPressable({
  children,
  onPress,
  scaleValue = 0.96,
  depth,
  fadeOnPress = false,
  sinkOnPress = true,
  dimWhenDisabled = true,
  tilt3D = false,
  haptic = 'light',
  style,
  disabled,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(disabled && dimWhenDisabled ? 0.45 : 1);
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const layoutRef = useRef({ width: 1, height: 1 });

  useEffect(() => {
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.settle);
  }, [disabled, dimWhenDisabled, opacity]);

  const animStyle = useAnimatedStyle(() => {
    if (tilt3D && !reduceAnimations) {
      return {
        opacity: opacity.value,
        transform: [
          { perspective: 800 },
          { rotateX: `${rotateX.value}deg` },
          { rotateY: `${rotateY.value}deg` },
          { scale: scale.value },
          { translateY: translateY.value },
        ],
      };
    }
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }, { translateY: translateY.value }],
    };
  });

  const handlePressIn = (e: any) => {
    if (disabled) return;
    if (reduceAnimations) {
      opacity.value = fadeOnPress ? 0.82 : 1;
      return;
    }
    const preset = depth ? PRESS_DEPTH[depth] : undefined;
    scale.value = withSpring(preset?.scale ?? scaleValue, preset?.spring ?? MOTION.pressFirm);
    translateY.value = withSpring(sinkOnPress ? (preset?.translateY ?? 1) : 0, preset?.spring ?? MOTION.pressFirm);
    opacity.value = withSpring(fadeOnPress ? (preset?.opacity ?? 0.9) : 1, MOTION.pressSoft);

    if (tilt3D) {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = layoutRef.current;
      const rx = -((locationY - height / 2) / (height / 2)) * 4;
      const ry = ((locationX - width / 2) / (width / 2)) * 4;
      rotateX.value = withSpring(rx, MOTION.pressFirm);
      rotateY.value = withSpring(ry, MOTION.pressFirm);
    }
  };

  const handlePressOut = () => {
    scale.value = reduceAnimations ? 1 : withSpring(1, MOTION.release);
    translateY.value = reduceAnimations ? 0 : withSpring(0, MOTION.release);
    opacity.value = withSpring(disabled && dimWhenDisabled ? 0.45 : 1, MOTION.release);
    if (tilt3D) {
      rotateX.value = withSpring(0, MOTION.release);
      rotateY.value = withSpring(0, MOTION.release);
    }
  };

  const handlePress = (e: any) => {
    if (hapticEnabled && haptic !== 'none') {
      const impact = haptic === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(impact);
    }
    onPress?.(e);
  };

  return (
    <AnimatedPress
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLayout={(e) => {
        layoutRef.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
      disabled={disabled}
      style={[animStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPress>
  );
}
