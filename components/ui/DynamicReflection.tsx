import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/ui/theme';

interface DynamicReflectionProps {
  intensity?: number;
}

/**
 * The diagonal sheen on glass panels. Static.
 *
 * It used to follow the phone's tilt: every GlassPanel subscribed to the
 * rotation sensor at 16 ms and started two springs on every reading, so each
 * panel on screen animated on the UI thread nonstop. Measured on 2026-10-01
 * (release build, emulator), Settings drew 241 frames in 8 s while doing
 * nothing, at 120% CPU, and 98% of scroll frames were janky. With the
 * reflection gone: 0 idle frames and 4% CPU. On a real phone the sensor never
 * holds still, so the cost there was at least as high, plus the battery.
 * The look (angle, gradient, intensity) is unchanged; it just no longer moves.
 */
export function DynamicReflection({ intensity = 1 }: DynamicReflectionProps) {
  const { colors } = useTheme();

  const gradientColors = colors.isDark
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          width: '300%',
          height: '300%',
          top: '-100%',
          left: '-100%',
          opacity: intensity,
          transform: [{ rotate: '25deg' }],
        }}
      >
        <LinearGradient
          colors={gradientColors as unknown as readonly [string, string, ...string[]]}
          locations={[0, 0.45, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}
