import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';

interface Props {
  password: string;
}

function getStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { level: 0, label: '' };
  const hasLength = pw.length >= 8;
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  if (hasLength && hasUpper && hasDigit) return { level: 3, label: 'Strong' };
  if (hasLength) return { level: 2, label: 'Fair' };
  return { level: 1, label: 'Weak' };
}

const STRENGTH_COLORS: Record<1 | 2 | 3, string> = {
  1: '#EF4444', // danger
  2: '#F59E0B', // amber
  3: '#10B981', // success/green
};

export function PasswordStrengthBar({ password }: Props) {
  const { colors, radius, animation } = useTheme();
  const { level, label } = getStrength(password);

  if (!password.length) return null;

  const activeColor = level > 0 ? STRENGTH_COLORS[level] : colors.border;

  return (
    <Animated.View
      entering={animation(FadeInDown.duration(80))}
      style={{ marginTop: SPACING.xs }}
    >
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
        {([1, 2, 3] as const).map(i => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: radius.sm,
              backgroundColor: i <= level ? activeColor : colors.border,
            }}
          />
        ))}
      </View>
      {label ? (
        <Text
          style={{
            color: activeColor,
            fontSize: 11,
            fontWeight: FONT_WEIGHT.semibold,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Animated.View>
  );
}
