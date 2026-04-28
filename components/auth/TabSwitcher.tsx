import React from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme, SPACING, FONT_WEIGHT } from '../../lib/theme';

type Mode = 'email' | 'phone';

interface TabSwitcherProps {
  mode: Mode;
  onChange: (m: Mode) => void;
}

export function TabSwitcher({ mode, onChange }: TabSwitcherProps) {
  const { colors, radius } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: SPACING.xs / 2,
        marginBottom: SPACING.md,
      }}
    >
      {(['email', 'phone'] as const).map(tab => {
        const active = mode === tab;
        return (
          <AnimatedPressable
            key={tab}
            onPress={() => onChange(tab)}
            scaleValue={0.96}
            haptic="light"
            style={{
              flex: 1,
              paddingVertical: SPACING.sm,
              alignItems: 'center',
              borderRadius: radius.md,
              backgroundColor: active ? colors.accent : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? '#fff' : colors.textMuted,
                fontSize: 14,
                fontWeight: FONT_WEIGHT.semibold,
                textTransform: 'capitalize',
              }}
            >
              {tab === 'email' ? 'Email' : 'Phone'}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
