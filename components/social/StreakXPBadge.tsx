import React from 'react';
import { Text } from 'react-native';
import { useRetention } from '../../lib/retention';
import { useTheme } from '../../lib/theme';

const COMPACT_TEXT_SCALE = 1.15;

export function StreakXPBadge() {
  const { xp, level, streakDays } = useRetention();
  const { colors, font } = useTheme();

  if (xp === 0 && streakDays === 0) return null;

  const parts: string[] = [];
  if (streakDays > 0) parts.push(`🔥 ${streakDays} day streak`);
  parts.push(`Level ${level}`);
  if (xp > 0) parts.push(`${xp} XP`);

  return (
    <Text
      style={[font.body, { color: colors.textMuted, fontSize: 13, paddingHorizontal: 16, marginBottom: 12 }]}
      numberOfLines={1}
      maxFontSizeMultiplier={COMPACT_TEXT_SCALE}
    >
      {parts.join('  ·  ')}
    </Text>
  );
}
