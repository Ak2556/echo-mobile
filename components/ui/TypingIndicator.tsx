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

function Dot({ delay }: { delay: number }) {
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
          backgroundColor: '#71717A',
          marginHorizontal: 2,
        },
        style,
      ]}
    />
  );
}

export function TypingIndicator() {
  return (
    <View className="flex-row justify-start px-4 my-2">
      <View className="bg-zinc-800 rounded-2xl rounded-tl-sm px-5 py-4 flex-row items-center">
        <Dot delay={0} />
        <Dot delay={80} />
        <Dot delay={160} />
      </View>
    </View>
  );
}
