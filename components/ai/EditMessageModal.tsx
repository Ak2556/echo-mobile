import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../ui/Button';
import { useTheme } from '../../lib/ui/theme';
import { tap } from '../../lib/ui/haptics';
import { ttx } from '../../lib/i18n/i18n';

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
  const { colors } = useTheme();
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
    <BottomSheet visible={visible} onClose={onCancel} variant="floating">
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
            placeholder={ttx("Type your message…")}
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
            <Button label={ttx("Cancel")} onPress={onCancel} variant="secondary" size="compact" />
            <Button label={submitLabel} onPress={handleSubmit} size="compact" disabled={!text.trim()} />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
