import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp } from 'phosphor-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [text, setText] = useState('');
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { colors, reduceAnimations } = useTheme();
  const sendScale = useSharedValue(1);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      sendScale.value = withSequence(
        withSpring(0.88, { damping: 18, stiffness: 600 }),
        withSpring(1, { damping: 18, stiffness: 500 })
      );
      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSend(text.trim());
      setText('');
    }
  };

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: withSpring(text.trim() ? 1 : 0.4, { damping: 20, stiffness: 500 }),
    transform: [{ scale: sendScale.value }],
  }));

  const canSend = !!text.trim() && !isLoading;
  const sendBg = canSend ? colors.accent : colors.surfaceHover;

  return (
    <View
      style={{
        overflow: 'hidden',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.glassBorder,
      }}
    >
      {Platform.OS === 'ios' && !reduceAnimations ? (
        <>
          <BlurView
            intensity={70}
            tint={colors.isDark ? 'dark' : 'extraLight'}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassHeavyFill ?? 'rgba(255,255,255,0.10)' }]}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        {/* Input bubble */}
        <View
          style={{
            flex: 1,
            marginRight: 8,
            borderRadius: 22,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            backgroundColor: colors.isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
            paddingHorizontal: 16,
            paddingVertical: 10,
            minHeight: 44,
            justifyContent: 'center',
          }}
        >
          <TextInput
            placeholder="Message Echo..."
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            maxLength={1000}
            multiline
            placeholderTextColor={colors.textMuted}
            style={{
              color: colors.text,
              fontSize: 16,
              maxHeight: 120,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          />
        </View>

        {/* Send button */}
        <Animated.View style={buttonStyle}>
          <AnimatedPressable
            onPress={handleSend}
            disabled={!canSend}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: sendBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: canSend ? 0 : StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
            }}
            scaleValue={0.88}
            haptic="none"
          >
            <ArrowUp color={canSend ? '#fff' : colors.textMuted} size={20} weight="bold" />
          </AnimatedPressable>
        </Animated.View>
      </View>
    </View>
  );
}
