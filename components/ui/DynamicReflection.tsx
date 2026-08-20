import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedSensor,
  SensorType,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/shared/lib/theme';

interface DynamicReflectionProps {
  intensity?: number;
}

export function DynamicReflection({ intensity = 0.5 }: DynamicReflectionProps) {
  const { colors } = useTheme();
  // We use the rotation sensor to get absolute device tilt.
  // Pitch and roll give us the 2D tilt.
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  const rStyle = useAnimatedStyle(() => {
    // Rotation sensor provides a quaternion or pitch/roll/yaw depending on the OS/API.
    // In Reanimated, SensorType.ROTATION provides { pitch, roll, yaw } in radians.
    const pitch = sensor.sensor.value.pitch;
    const roll = sensor.sensor.value.roll;

    // We map tilt (-PI/2 to PI/2) to a translation on the X and Y axes.
    // Assuming the view is a large overlay, moving it creates the reflection shift.
    // We move a bright gradient overlay up to 200px based on tilt.
    const translateX = withSpring(
      interpolate(roll, [-Math.PI / 2, Math.PI / 2], [-200, 200], Extrapolation.CLAMP),
      { damping: 20, stiffness: 90 }
    );
    
    const translateY = withSpring(
      interpolate(pitch, [-Math.PI / 2, Math.PI / 2], [-200, 200], Extrapolation.CLAMP),
      { damping: 20, stiffness: 90 }
    );

    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: '35deg' }, // Angle the reflection
      ],
      opacity: withTiming(intensity, { duration: 300 }),
    };
  });

  // A wide, semi-transparent white/bright band
  const gradientColors = colors.isDark
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0)'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* We make the animated view much larger than its container so we can shift it */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: '250%',
            height: '250%',
            top: '-75%',
            left: '-75%',
          },
          rStyle,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
