import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { TextInput } from '../ui/TextInput';
import { ArrowUp } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: withSpring(text.trim() ? 1 : 0.5),
    transform: [{ scale: withSpring(text.trim() ? 1 : 0.9) }]
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
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || isLoading}
          className="bg-white h-[50px] w-[50px] rounded-full items-center justify-center mb-[1px]"
        >
          <ArrowUp color="#000" size={24} strokeWidth={2.5} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
