import React, { useState } from 'react';
import { View } from 'react-native';
import { TextInput } from '../ui/TextInput';
import { ArrowUp } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [text, setText] = useState('');
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const sendScale = useSharedValue(1);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      // Punch animation on send
      sendScale.value = withSequence(
        withSpring(0.75, { damping: 8, stiffness: 500 }),
        withSpring(1.1, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSend(text.trim());
      setText('');
    }
  };

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: withSpring(text.trim() ? 1 : 0.4, { damping: 15, stiffness: 200 }),
    transform: [{ scale: sendScale.value }],
  }));

  return (
    <View className="flex-row items-end px-4 py-3 bg-black border-t border-zinc-900">
      <View className="flex-1 mr-2">
        <TextInput
          placeholder="Message Echo..."
          value={text}
          onChangeText={setText}
          maxLength={1000}
        />
      </View>
      <Animated.View style={buttonStyle}>
        <AnimatedPressable
          onPress={handleSend}
          disabled={!text.trim() || isLoading}
          className="bg-white h-[50px] w-[50px] rounded-full items-center justify-center mb-[1px]"
          scaleValue={0.88}
          haptic="none"
        >
          <ArrowUp color="#000" size={24} strokeWidth={2.5} />
        </AnimatedPressable>
      </Animated.View>
    </View>
  );
}
