import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { useTheme } from '../../lib/theme';

function Dot({ delay, color }: { delay: number; color: string }) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0.4, { duration: 200 })
        ),
        -1
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0.3, { duration: 200 })
        ),
        -1
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          marginHorizontal: 2,
        },
        style,
      ]}
    />
  );
}

export function TypingIndicator() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16, marginVertical: 8 }}>
      <GlassPanel
        variant="medium"
        borderRadius={20}
        style={{ borderBottomLeftRadius: 4 }}
        contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
      >
        <Dot delay={0} color={colors.textMuted} />
        <Dot delay={80} color={colors.textMuted} />
        <Dot delay={160} color={colors.textMuted} />
      </GlassPanel>
    </View>
  );
}
