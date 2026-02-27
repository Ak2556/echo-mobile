import React from 'react';
import { TextInput, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search echoes...' }: SearchBarProps) {
  const { colors, reduceAnimations } = useTheme();
  const focused = useSharedValue(0);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceAnimations ? 1 : withSpring(focused.value ? 1.012 : 1, MOTION.settle) }],
  }));

  return (
    <Animated.View
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceHover,
        borderRadius: 9999,
        paddingHorizontal: 20,
        height: 52,
      }, shellStyle]}
    >
      <MagnifyingGlass
        color={colors.textMuted}
        size={20}
        weight="regular"
      />
      <TextInput
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 16,
          marginLeft: 10,
          paddingVertical: 0,
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { focused.value = withSpring(1, MOTION.snap); }}
        onBlur={() => { focused.value = withSpring(0, MOTION.settle); }}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.textMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X color={colors.surface} size={12} weight="bold" />
        </Pressable>
      )}
    </Animated.View>
  );
}
