import React, { useEffect, useState } from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { MOTION } from '../../lib/motion';
import { useToggleEchoReaction, useToggleCommentReaction } from '../../hooks/queries/useSupabaseSocial';
import { track } from '../../lib/analytics';
import type { EchoReaction, ReactionCounts } from '../../types';

/**
 * Knowledge-reaction pile.
 *
 * Tap a chip to toggle. Counts update optimistically; rollback on error.
 * Chips render only when count > 0 *or* the viewer has reacted that way,
 * keeping the bar clean on low-engagement echoes (one always-visible "+ react"
 * affordance still lets the viewer pick).
 */

// Warm editorial palette (lib/avatarPalette.ts) — one tint per reaction.
const REACTION_META: Record<EchoReaction, { shortLabel: string; label: string; tint: string }> = {
  mind_blown:   { shortLabel: 'Insight', label: 'insightful',   tint: '#8B5E7D' },
  taking_notes: { shortLabel: 'Notes',   label: 'taking notes', tint: '#B08536' },
  agree:        { shortLabel: 'Agree',   label: 'agree',        tint: '#7A8B4E' },
  disagree:     { shortLabel: 'Rethink', label: 'rethink',      tint: '#4E7A8B' },
};

const ORDER: EchoReaction[] = ['mind_blown', 'taking_notes', 'agree', 'disagree'];

interface ReactionBarProps {
  target: { kind: 'echo'; echoId: string } | { kind: 'comment'; commentId: string };
  counts?: ReactionCounts;
  userReactions?: EchoReaction[];
  compact?: boolean;
}

export function ReactionBar({ target, counts, userReactions, compact }: ReactionBarProps) {
  const { colors } = useTheme();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const echoMut = useToggleEchoReaction();
  const commentMut = useToggleCommentReaction();

  // Local optimistic state — falls back to props when fresh data arrives.
  const [localCounts, setLocalCounts] = useState<ReactionCounts>(() => ({
    mind_blown:   counts?.mind_blown   ?? 0,
    taking_notes: counts?.taking_notes ?? 0,
    agree:        counts?.agree        ?? 0,
    disagree:     counts?.disagree     ?? 0,
  }));
  const [localUserReactions, setLocalUserReactions] = useState<Set<EchoReaction>>(
    () => new Set(userReactions ?? []),
  );

  useEffect(() => {
    setLocalCounts({
      mind_blown:   counts?.mind_blown   ?? 0,
      taking_notes: counts?.taking_notes ?? 0,
      agree:        counts?.agree        ?? 0,
      disagree:     counts?.disagree     ?? 0,
    });
  }, [counts?.mind_blown, counts?.taking_notes, counts?.agree, counts?.disagree]);

  useEffect(() => {
    setLocalUserReactions(new Set(userReactions ?? []));
  }, [userReactions]);

  const visible = ORDER.filter((r) => localCounts[r] > 0 || localUserReactions.has(r));
  if (!visible.length && compact) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {ORDER.map((reaction) => {
        const count = localCounts[reaction];
        const reactedByMe = localUserReactions.has(reaction);
        // Hide chips with zero count unless the viewer has reacted, to keep the bar uncluttered.
        if (count === 0 && !reactedByMe && compact) return null;

        return (
          <ReactionChip
            key={reaction}
            reaction={reaction}
            count={count}
            active={reactedByMe}
            tint={colors.accent}
            onToggle={() => {
              const next = !reactedByMe;
              // Optimistic update.
              setLocalUserReactions((prev) => {
                const copy = new Set(prev);
                if (next) copy.add(reaction); else copy.delete(reaction);
                return copy;
              });
              setLocalCounts((prev) => ({
                ...prev,
                [reaction]: next ? prev[reaction] + 1 : Math.max(0, prev[reaction] - 1),
              }));
              if (hapticEnabled) {
                if (next) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                else Haptics.selectionAsync();
              }
              if (next) track('echo_reacted', { reaction, target_kind: target.kind });

              const rollback = () => {
                setLocalUserReactions((prev) => {
                  const copy = new Set(prev);
                  if (next) copy.delete(reaction); else copy.add(reaction);
                  return copy;
                });
                setLocalCounts((prev) => ({
                  ...prev,
                  [reaction]: next ? Math.max(0, prev[reaction] - 1) : prev[reaction] + 1,
                }));
              };

              if (target.kind === 'echo') {
                echoMut.mutate(
                  { echoId: target.echoId, reaction, on: next },
                  { onError: rollback },
                );
              } else {
                commentMut.mutate(
                  { commentId: target.commentId, reaction, on: next },
                  { onError: rollback },
                );
              }
            }}
          />
        );
      })}
    </View>
  );
}

interface ChipProps {
  reaction: EchoReaction;
  count: number;
  active: boolean;
  tint: string;
  onToggle: () => void;
}

function ReactionChip({ reaction, count, active, tint, onToggle }: ChipProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const meta = REACTION_META[reaction];
  const labelColor = active ? tint : '#A1A1AA';
  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: active ? `${tint}22` : 'transparent',
    borderWidth: 1,
    borderColor: active ? `${tint}66` : 'rgba(161,161,170,0.25)',
  };
  const labelStyle: TextStyle = { color: labelColor, fontSize: 12, fontWeight: '600' };

  return (
    <AnimatedPressable
      onPress={(e) => {
        e?.stopPropagation?.();
        scale.value = withSequence(
          withSpring(0.86, MOTION.pressFirm),
          withSpring(1, MOTION.overshoot),
        );
        onToggle();
      }}
      style={containerStyle}
      depth="medium"
      fadeOnPress
      haptic="none"
      performanceMode="hot"
      accessibilityLabel={`${active ? 'Remove' : 'Add'} reaction: ${meta.label}. ${count} so far.`}
      accessibilityRole="button"
    >
      <Animated.View style={animStyle}>
        <Text style={[labelStyle, { fontSize: 11 }]}>{meta.shortLabel}</Text>
      </Animated.View>
      {count > 0 && <Text style={labelStyle}>{count}</Text>}
    </AnimatedPressable>
  );
}
