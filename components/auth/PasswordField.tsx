import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ViewStyle } from 'react-native';
import { LockKey, Eye, EyeSlash } from 'phosphor-react-native';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  testID?: string;
  style?: ViewStyle;
  errorBorderColor?: string;
}

export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder = 'Password',
  testID,
  style,
  errorBorderColor,
}: PasswordFieldProps) {
  const { colors, radius } = useTheme();
  const [showPw, setShowPw] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = errorBorderColor
    ? errorBorderColor
    : focused
      ? colors.accent
      : colors.inputBorder;

  return (
    <View style={style}>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 12,
          fontWeight: FONT_WEIGHT.semibold,
          marginBottom: SPACING.xs,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.inputBg,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: SPACING.md,
          height: 52,
        }}
      >
        <LockKey color={colors.textMuted} size={18} style={{ marginRight: SPACING.sm }} />
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 15,
            fontWeight: FONT_WEIGHT.medium,
          }}
        />
        <Pressable
          onPress={() => setShowPw(s => !s)}
          hitSlop={8}
          accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
          accessibilityRole="button"
        >
          {showPw
            ? <EyeSlash color={colors.textMuted} size={18} />
            : <Eye color={colors.textMuted} size={18} />}
        </Pressable>
      </View>
    </View>
  );
}
