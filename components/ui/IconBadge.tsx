import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface IconBadgeProps {
  children: React.ReactNode;
  color: string;
  size?: number;
  radius?: number;
  muted?: boolean;
  style?: ViewStyle;
}

function shade(hex: string, factor: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * (1 - factor)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function IconBadge({ children, color, size = 36, radius, muted = false, style }: IconBadgeProps) {
  const borderRadius = radius ?? Math.round(size * 0.31);

  if (muted) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: `${color}1F`,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: `${color}35`,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[color, shade(color, 0.34)]}
      start={{ x: 0.12, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(8, size * 0.38),
          backgroundColor: 'rgba(255,255,255,0.17)',
          borderBottomLeftRadius: size,
          borderBottomRightRadius: size,
        }}
      />
      <View
        style={{
          width: size * 0.68,
          height: size * 0.68,
          borderRadius: size * 0.23,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.13)',
        }}
      >
        {children}
      </View>
    </LinearGradient>
  );
}
