import React from 'react';
import { TextInput as RNTextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../../lib/theme';

export function TextInput(props: TextInputProps) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.xl,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 50,
        justifyContent: 'center',
      }}
    >
      <RNTextInput
        style={{ color: colors.text, fontSize: 16, lineHeight: 20 }}
        placeholderTextColor={colors.textSecondary}
        multiline
        {...props}
      />
    </View>
  );
}
