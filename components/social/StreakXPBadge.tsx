import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FireSimple, Star } from 'phosphor-react-native';
import { useRetention } from '../../lib/retention';
import { useTheme } from '../../lib/theme';

const COMPACT_TEXT_SCALE = 1.15;

/**
 * Compact streak + XP/level chip for the profile screen. Two pieces:
 *   - Streak count
 *   - Level chip with progress bar to next level
 *
 * Renders nothing if the user has zero retention signal — first-run users
 * shouldn't see "Level 1 · 0 XP" cluttering their profile.
 */
export function StreakXPBadge() {
  const { xp, level, pct, xpToNext, streakDays, title } = useRetention();
  const { colors } = useTheme();

  if (xp === 0 && streakDays === 0) return null;

  return (
    <View style={styles.row}>
      {streakDays > 0 && (
        <View style={[styles.streak, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FireSimple color={colors.textMuted} size={15} weight="fill" />
          <Text style={[styles.streakNum, { color: colors.text }]} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{streakDays}</Text>
          <Text style={[styles.streakLabel, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>day streak</Text>
        </View>
      )}

      <View style={[styles.levelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.levelHeader}>
          <View style={[styles.levelChip, { backgroundColor: colors.accentMuted, borderColor: colors.accent + '40' }]}>
            <Star color={colors.accent} size={11} weight="fill" />
            <Text style={[styles.levelChipText, { color: colors.accent }]} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>LVL {level}</Text>
          </View>
          <Text style={[styles.levelTitle, { color: colors.text }]} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{title}</Text>
        </View>
        <View style={[styles.barTrack, { backgroundColor: colors.surfaceHover }]}>
          <View style={[styles.barFill, { width: `${Math.max(6, pct * 100)}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={[styles.barHint, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
          {xpToNext} XP to LVL {level + 1}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  streak: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  streakNum: {
    fontWeight: '800',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  streakLabel: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  levelCard: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  levelChipText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  levelTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 999,
  },
  barHint: {
    fontWeight: '700',
    fontSize: 11,
    marginTop: 6,
  },
});
