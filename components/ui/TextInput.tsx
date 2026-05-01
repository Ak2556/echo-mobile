import React from 'react';
import { TextInput as RNTextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../../lib/theme';

export function TextInput(props: TextInputProps) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.inputBg,
        borderColor: colors.inputBorder,
        borderRadius: radius.lg,
        borderWidth: 1,
        justifyContent: 'center',
        minHeight: 50,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <RNTextInput
        {...props}
        placeholderTextColor={colors.textMuted}
        multiline
        style={[{ color: colors.text, fontSize: 16, lineHeight: 20 }, props.style]}
      />
    </View>
  );
}
