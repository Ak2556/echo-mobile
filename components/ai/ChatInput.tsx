import React, { useEffect, useState } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowUp, Stop } from 'phosphor-react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { MOTION } from '../../lib/motion';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  /** Called when the user taps the stop button during streaming. */
  onStop?: () => void;
  draft?: string;
  onDraftChange?: (text: string) => void;
}

export function ChatInput({ onSend, isLoading, onStop, draft, onDraftChange }: ChatInputProps) {
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

  const handleStop = () => {
    sendScale.value = withSequence(
      withSpring(0.86, MOTION.pressDeep),
      withSpring(1, MOTION.overshoot)
    );
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onStop?.();
  };

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: withSpring(isLoading || text.trim() ? 1 : 0.4, { damping: 20, stiffness: 500 }),
    transform: [{ scale: sendScale.value }],
  }));

  const inputShellStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.glassBorder, colors.accent]),
    transform: [{ scale: reduceAnimations ? 1 : withSpring(focus.value ? 1.012 : 1, MOTION.settle) }],
  }));

  const isStop = !!isLoading && !!onStop;
  const canSend = !!text.trim() && !isLoading;
  const sendBg = isStop ? colors.danger : canSend ? colors.accent : colors.surfaceHover;

  return (
    <View
      style={{
        overflow: 'hidden',
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 8,
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
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.isDark ? 'rgba(0,0,0,0.36)' : 'rgba(255,255,255,0.58)' }]}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          padding: 6,
          borderRadius: 28,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          backgroundColor: colors.surface,
          shadowColor: '#000',
          shadowOpacity: colors.isDark ? 0.36 : 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {/* Input bubble */}
        <Animated.View
          style={[{
            flex: 1,
            marginRight: 6,
            borderRadius: 22,
            borderWidth: 0,
            paddingHorizontal: 14,
            paddingVertical: 9,
            minHeight: 42,
            justifyContent: 'center',
          }, inputShellStyle]}
        >
          <TextInput
            placeholder={isLoading ? 'Responding...' : 'Message Echo...'}
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
              fontFamily: 'Inter_400Regular',
            }}
          />
        </Animated.View>

        {/* Send / Stop button */}
        <Animated.View style={buttonStyle}>
          <AnimatedPressable
            onPress={isStop ? handleStop : handleSend}
            disabled={!isStop && !canSend}
            depth="deep"
            fadeOnPress
            style={{
              width: 44,
              height: 42,
              borderRadius: 21,
              backgroundColor: sendBg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: (!isStop && !canSend) ? StyleSheet.hairlineWidth : 0,
              borderColor: colors.glassBorder,
            }}
            scaleValue={0.88}
            haptic="none"
          >
            {isStop ? (
              <Stop color="#fff" size={18} weight="fill" />
            ) : (
              <ArrowUp color={canSend ? '#fff' : colors.textMuted} size={20} weight="bold" />
            )}
          </AnimatedPressable>
        </Animated.View>
      </View>
    </View>
  );
}
