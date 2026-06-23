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
import {
  ArrowsClockwise,
  Bell,
  BookmarkSimple,
  Broom,
  ChatCircle,
  CheckCircle,
  Globe,
  Info,
  PaintBrush,
  Robot,
  TextT,
  WarningCircle,
} from 'phosphor-react-native';
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

function ToastIcon({ value }: { value: string | null }) {
  const { colors } = useTheme();
  if (!value) return null;

  const key = value.toLowerCase();
  const iconColor = key.includes('error') || key.includes('denied') || key.includes('required')
    ? colors.danger
    : colors.accent;

  let Icon = Info;
  if (key.includes('error') || key.includes('denied') || key.includes('required')) Icon = WarningCircle;
  else if (key.includes('bookmark') || value === '\u{1F516}') Icon = BookmarkSimple;
  else if (key.includes('re-echo') || value === '\u{1F501}') Icon = ArrowsClockwise;
  else if (key.includes('accent') || key.includes('theme') || key.includes('corners') || value === '\u{1F3A8}') Icon = PaintBrush;
  else if (key.includes('cache') || key.includes('cleared') || value === '\u{1F9F9}') Icon = Broom;
  else if (key.includes('font') || value === '\u{1F524}') Icon = TextT;
  else if (key.includes('model') || value === '\u{1F916}') Icon = Robot;
  else if (key.includes('bubble') || value === '\u{1F4AC}') Icon = ChatCircle;
  else if (key.includes('dm') || value === '\u{1F4EC}') Icon = ChatCircle;
  else if (key.includes('language') || value === '\u{1F30D}') Icon = Globe;
  else if (key.includes('notification') || key.includes('broadcast') || value === '\u{1F4E1}') Icon = Bell;
  else if (
    key.includes('done') ||
    key.includes('saved') ||
    key.includes('updated') ||
    key.includes('created') ||
    key.includes('joined') ||
    key.includes('following') ||
    key.includes('submitted') ||
    key.includes('pinned') ||
    key.includes('added') ||
    value === '\u{2728}' ||
    value === '\u{1F91D}'
  ) {
    Icon = CheckCircle;
  }

  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 9,
        backgroundColor: iconColor === colors.danger ? colors.dangerMuted : colors.accentMuted,
      }}
    >
      <Icon color={iconColor} size={15} weight="bold" />
    </View>
  );
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
              <ToastIcon value={icon} />
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
            <ToastIcon value={icon} />
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
