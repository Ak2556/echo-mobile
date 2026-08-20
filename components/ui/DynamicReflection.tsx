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
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/shared/lib/theme';

interface DynamicReflectionProps {
  intensity?: number;
}

export function DynamicReflection({ intensity = 1 }: DynamicReflectionProps) {
  const { colors } = useTheme();
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  const rStyle = useAnimatedStyle(() => {
    // Rotation sensor provides a quaternion or pitch/roll/yaw depending on the OS/API.
    // In Reanimated, SensorType.ROTATION provides { pitch, roll, yaw } in radians.
    const pitch = sensor.sensor.value.pitch;
    const roll = sensor.sensor.value.roll;

    // We map tilt (-PI/2 to PI/2) to a translation on the X and Y axes.
    // Assuming the view is a large overlay, moving it creates the reflection shift.
    // Increased range of motion for dramatic effect (-400 to 400).
    const translateX = withSpring(
      interpolate(roll, [-Math.PI / 2, Math.PI / 2], [-400, 400], Extrapolation.CLAMP),
      { damping: 30, stiffness: 120 }
    );
    
    const translateY = withSpring(
      interpolate(pitch, [-Math.PI / 2, Math.PI / 2], [-400, 400], Extrapolation.CLAMP),
      { damping: 30, stiffness: 120 }
    );

    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: '25deg' }, // Angle the reflection
      ],
      opacity: withTiming(intensity, { duration: 300 }),
    };
  });

  const gradientColors = colors.isDark
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: '300%',
            height: '300%',
            top: '-100%',
            left: '-100%',
          },
          rStyle,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.45, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
