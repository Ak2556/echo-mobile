import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/theme';

interface ReflectiveNavIconProps {
  active: boolean;
  children: React.ReactNode;
  size?: number;
  radius?: number;
}

export function ReflectiveNavIcon({ active, children, size = 32, radius = 12 }: ReflectiveNavIconProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        shadowColor: colors.accent,
        shadowOpacity: active ? (colors.isDark ? 0.28 : 0.16) : 0,
        shadowRadius: active ? 8 : 0,
        shadowOffset: { width: 0, height: 2 },
        elevation: active ? 1 : 0,
      }}
    >
      {active ? (
        <>
          <LinearGradient
            colors={['transparent', `${colors.accent}2B`, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              position: 'absolute',
              bottom: 2,
              width: size * 0.96,
              height: Math.max(7, size * 0.22),
              borderRadius: 999,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 3,
              width: size * 0.48,
              height: StyleSheet.hairlineWidth,
              borderRadius: 999,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.86)',
              opacity: 0.85,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 4,
              width: size * 0.2,
              height: StyleSheet.hairlineWidth,
              borderRadius: 999,
              backgroundColor: `${colors.accent}55`,
              opacity: 0.8,
              transform: [{ translateX: size * 0.16 }],
            }}
          />
        </>
      ) : null}
      <View style={{ zIndex: 1 }}>{children}</View>
    </View>
  );
}
