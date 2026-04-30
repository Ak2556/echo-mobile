import React, { useEffect, useCallback } from 'react';
import { Text, View, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { create } from 'zustand';
import { useTheme } from '../../lib/theme';

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
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const dismissToast = useCallback(() => {
    hide();
  }, [hide]);

  useEffect(() => {
    if (message) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 500 });
      opacity.value = withTiming(1, { duration: 80 });

      const timer = setTimeout(() => {
        translateY.value = withSpring(-100, { damping: 20, stiffness: 500 });
        opacity.value = withDelay(60, withTiming(0, { duration: 80 }));
        setTimeout(dismissToast, 200);
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      translateY.value = -100;
      opacity.value = 0;
    }
  }, [message]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  return (
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
      {Platform.OS === 'ios' ? (
        <>
          <BlurView
            intensity={80}
            tint={colors.isDark ? 'dark' : 'extraLight'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.12)' },
            ]}
          />
          {/* Top shine */}
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
  );
}
