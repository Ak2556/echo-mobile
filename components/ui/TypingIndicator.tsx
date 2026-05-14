import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
} from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { useTheme } from '../../lib/theme';

// Single shared value drives both scale + opacity — halves the animation count
function Dot({ delay, color }: { delay: number; color: string }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0, { duration: 280 })
        ),
        -1,
        false
      )
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0, 1], [0.4, 1]) }],
    opacity: interpolate(t.value, [0, 1], [0.3, 1]),
  }));

  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginHorizontal: 2 }, style]}
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
        <Dot delay={100} color={colors.textMuted} />
        <Dot delay={200} color={colors.textMuted} />
      </GlassPanel>
    </View>
  );
}
