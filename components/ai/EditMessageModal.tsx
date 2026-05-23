import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';

interface EditMessageModalProps {
  visible: boolean;
  initialValue: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  maxLength?: number;
}

export function EditMessageModal({
  visible,
  initialValue,
  onCancel,
  onSubmit,
  title = 'Edit message',
  subtitle = 'Re-send to regenerate the answer.',
  submitLabel = 'Resend',
  maxLength = 4000,
}: EditMessageModalProps) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText(initialValue);
      // Focus on next tick so the modal mount finishes first.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [visible, initialValue]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    tap('medium');
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onCancel} />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <Animated.View
          entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
          exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
          style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }}
        >
          <View
            style={{
              borderRadius: 22,
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
              backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
            }}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={80} tint={colors.isDark ? 'dark' : 'extraLight'} style={StyleSheet.absoluteFill} />
            )}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
              {subtitle && (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
              )}
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={maxLength}
                placeholder="Type your message…"
                placeholderTextColor={colors.textMuted}
                style={{
                  marginTop: 12,
                  minHeight: 100,
                  maxHeight: 220,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.glassBorder,
                  backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  color: colors.text,
                  fontSize: 15,
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>
                  {text.length}/{maxLength}
                </Text>
                <Pressable
                  onPress={onCancel}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={!text.trim()}
                  style={({ pressed }) => ({
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: text.trim() ? colors.accent : colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: text.trim() ? '#fff' : colors.textMuted, fontWeight: '700' }}>{submitLabel}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
