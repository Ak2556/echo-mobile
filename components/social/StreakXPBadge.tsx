import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FireSimple, Star } from 'phosphor-react-native';
import { useRetention } from '../../lib/retention';
import { GRADIENTS, NEON, neonGlow } from '../../lib/neonDesign';

const COMPACT_TEXT_SCALE = 1.15;

/**
 * Compact streak + XP/level chip for the profile screen. Two pieces:
 *   • Streak flame with day count
 *   • Level chip with progress bar to next level
 *
 * Renders nothing if the user has zero retention signal — first-run users
 * shouldn't see "Level 1 · 0 XP" cluttering their profile.
 */
export function StreakXPBadge() {
  const { xp, level, pct, xpToNext, streakDays, title } = useRetention();

  if (xp === 0 && streakDays === 0) return null;

  return (
    <View style={styles.row}>
      {streakDays > 0 && (
        <View style={[styles.streak, neonGlow(NEON.amber, 'soft')]}>
          <FireSimple color={NEON.amber} size={16} weight="fill" />
          <Text style={styles.streakNum} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{streakDays}</Text>
          <Text style={styles.streakLabel} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>day streak</Text>
        </View>
      )}

      <View style={[styles.levelCard, neonGlow(NEON.lime, 'soft')]}>
        <View style={styles.levelHeader}>
          <View style={styles.levelChip}>
            <Star color={NEON.lime} size={11} weight="fill" />
            <Text style={styles.levelChipText} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>LVL {level}</Text>
          </View>
          <Text style={styles.levelTitle} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{title}</Text>
        </View>
        <View style={styles.barTrack}>
          <LinearGradient
            colors={GRADIENTS.achievement}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${Math.max(6, pct * 100)}%` }]}
          />
        </View>
        <Text style={styles.barHint} numberOfLines={1} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: 'rgba(255,177,43,0.32)',
  },
  streakNum: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  streakLabel: {
    color: '#A1A1AA',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  levelCard: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#101018',
    borderWidth: 1,
    borderColor: 'rgba(198,255,61,0.28)',
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
    backgroundColor: 'rgba(198,255,61,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(198,255,61,0.42)',
  },
  levelChipText: {
    color: NEON.lime,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  levelTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 999,
  },
  barHint: {
    color: '#71717A',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 6,
  },
});
