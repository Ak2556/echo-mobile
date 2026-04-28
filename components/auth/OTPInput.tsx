import React, { useRef, useEffect } from 'react';
import { View, TextInput, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { useTheme, SPACING } from '../../lib/theme';

interface OTPInputProps {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  length?: number;
}

export function OTPInput({ value, onChange, autoFocus = false, length = 6 }: OTPInputProps) {
  const { colors, radius } = useTheme();
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputs.current[0]?.focus(), 100);
    }
  }, [autoFocus]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const chars = value.split('');
    chars[index] = digit;
    // Trim trailing empty slots
    const next = chars.slice(0, length).join('').replace(/\s/g, '');
    onChange(next.padEnd(index + (digit ? 1 : 0), '').slice(0, length));
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (value[index]) {
        // Clear current digit
        const chars = value.split('');
        chars[index] = '';
        onChange(chars.join(''));
      } else if (index > 0) {
        // Move back and clear previous
        inputs.current[index - 1]?.focus();
        const chars = value.split('');
        chars[index - 1] = '';
        onChange(chars.join(''));
      }
    }
  };

  const isComplete = value.length === length;

  return (
    <View style={{ flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => {
        const digit = value[i] ?? '';
        const isActive = i === value.length && !isComplete;
        const isFilled = !!digit;

        return (
          <TextInput
            key={i}
            ref={r => { inputs.current[i] = r; }}
            value={digit}
            onChangeText={text => handleChange(text, i)}
            onKeyPress={e => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            caretHidden
            style={{
              width: 44,
              height: 56,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: isActive
                ? colors.accent
                : isFilled
                  ? isComplete ? colors.accent : colors.accent
                  : colors.border,
              backgroundColor: isComplete ? colors.accentMuted : colors.inputBg,
              color: colors.text,
              fontSize: 22,
              fontWeight: '700',
              textAlign: 'center',
            }}
          />
        );
      })}
    </View>
  );
}
