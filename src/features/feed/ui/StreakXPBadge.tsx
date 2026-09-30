import React from 'react';
import { Text } from 'react-native';
import { useRetention } from '../../../../lib/retention';
import { useTheme } from '../../../shared/lib/theme';

const COMPACT_TEXT_SCALE = 1.15;

export function StreakXPBadge() {
  const { streakDays } = useRetention();
  const { colors, font } = useTheme();

  // Level and XP are no longer shown: ranks (RankCard) replaced them. XP was
  // counted on the device only, so it reset on reinstall, differed between
  // phones and nobody else could see it; two progressions side by side
  // ("Level 3" and "Contributor") would only confuse. The streak stays.
  if (streakDays === 0) return null;

  const parts: string[] = [`🔥 ${streakDays} day streak`];

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
