import React, { useEffect, useCallback } from 'react';
import { Text, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { create } from 'zustand';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const dismissToast = useCallback(() => {
    hide();
  }, [hide]);

  useEffect(() => {
    if (message) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 500 });
      opacity.value = withTiming(1, { duration: 80 });

      // Auto-dismiss after 2s
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
          backgroundColor: '#18181b',
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderWidth: 1,
          borderColor: '#3f3f46',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
        },
        animStyle,
      ]}
    >
      {icon ? <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text> : null}
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{message}</Text>
    </Animated.View>
  );
}
