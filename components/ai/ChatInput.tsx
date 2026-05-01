import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp } from 'phosphor-react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  draft?: string;
  onDraftChange?: (text: string) => void;
}

export function ChatInput({ onSend, isLoading, draft, onDraftChange }: ChatInputProps) {
  const [text, setText] = useState('');
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const { colors, reduceAnimations } = useTheme();
  const sendScale = useSharedValue(1);
  const focus = useSharedValue(0);

  useEffect(() => {
    if (draft !== undefined && draft !== text) setText(draft);
  }, [draft, text]);

  const updateText = (next: string) => {
    setText(next);
    onDraftChange?.(next);
  };

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      sendScale.value = withSequence(
        withSpring(0.86, MOTION.pressDeep),
        withSpring(1, MOTION.overshoot)
      );
      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSend(text.trim());
      updateText('');
    }
  };

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: withSpring(text.trim() ? 1 : 0.4, { damping: 20, stiffness: 500 }),
    transform: [{ scale: sendScale.value }],
  }));

  const inputShellStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.glassBorder, colors.accent]),
    transform: [{ scale: reduceAnimations ? 1 : withSpring(focus.value ? 1.012 : 1, MOTION.settle) }],
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
        <Animated.View
          style={[{
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
          }, inputShellStyle]}
        >
          <TextInput
            placeholder="Message Echo..."
            value={text}
            onChangeText={updateText}
            onFocus={() => { focus.value = withSpring(1, MOTION.snap); }}
            onBlur={() => { focus.value = withSpring(0, MOTION.settle); }}
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
        </Animated.View>

        {/* Send button */}
        <Animated.View style={buttonStyle}>
          <AnimatedPressable
            onPress={handleSend}
            disabled={!canSend}
            depth="deep"
            fadeOnPress
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
