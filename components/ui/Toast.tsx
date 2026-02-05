import React, { useEffect, useCallback } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { create } from 'zustand';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';
import { usePerformanceProfile } from '../../lib/performance';

interface ToastState {
  message: string | null;
  icon: string | null;
  show: (message: string, icon?: string) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  icon: null,
  show: (message, icon = '') => set({ message, icon }),
  hide: () => set({ message: null, icon: null }),
}));

export function showToast(message: string, icon?: string) {
  useToastStore.getState().show(message, icon);
}

export function ToastProvider() {
  const { message, icon, hide } = useToastStore();
  const { colors } = useTheme();
  const performance = usePerformanceProfile('overlay');
  const translateY = useSharedValue(-120);
  const dragY = useSharedValue(0);
  const opacity = useSharedValue(0);

  const dismissToast = useCallback(() => {
    hide();
  }, [hide]);

  const animateOut = useCallback(() => {
    translateY.value = withSpring(-200, { damping: 18, stiffness: 560, mass: 0.7 });
    opacity.value = withTiming(0, { duration: 120 });
    setTimeout(dismissToast, 220);
  }, [dismissToast, translateY, opacity]);

  useEffect(() => {
    if (message) {
      dragY.value = 0;
      translateY.value = -120;
      opacity.value = 0;

      translateY.value = performance.pressAnimations
        ? withSpring(0, { damping: 22, stiffness: 500, mass: 0.85 })
        : 0;
      opacity.value = withTiming(1, { duration: 80 });

      const timer = setTimeout(animateOut, 2400);
      return () => clearTimeout(timer);
    } else {
      translateY.value = -120;
      dragY.value = 0;
      opacity.value = 0;
    }
  }, [message, animateOut, performance, translateY, dragY, opacity]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      // Resist downward drag; allow upward freely
      const dy = e.translationY;
      dragY.value = dy < 0 ? dy : dy * 0.25;
    })
    .onEnd((e) => {
      const shouldDismiss = e.translationY < -30 || e.velocityY < -500;
      if (shouldDismiss) {
        translateY.value = withSpring(-220, { damping: 18, stiffness: 560, mass: 0.7 });
        opacity.value = withTiming(0, { duration: 100 });
        runOnJS(dismissToast)();
      } else {
        dragY.value = withSpring(0, MOTION.release);
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 60,
            left: 20,
            right: 20,
            zIndex: 9999,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: colors.isDark ? 0.45 : 0.18,
            shadowRadius: 20,
            elevation: 12,
          },
          animStyle,
        ]}
      >
        {performance.useBlur ? (
          <>
            <BlurView
              intensity={performance.maxBlurIntensity}
              tint={colors.isDark ? 'dark' : 'extraLight'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.12)' },
              ]}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: colors.glassHighlight,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                paddingHorizontal: 20,
              }}
            >
              {icon ? <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text> : null}
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}
                accessibilityLiveRegion="polite"
              >
                {message}
              </Text>
            </View>
          </>
        ) : (
          <View
            style={{
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              paddingHorizontal: 20,
            }}
          >
            {icon ? <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text> : null}
            <Text
              style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}
              accessibilityLiveRegion="polite"
            >
              {message}
            </Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
