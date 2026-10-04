import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CaretDown, CaretUp, Medal } from 'phosphor-react-native';
import { RANK_RULES, isActiveThisWeek, rankProgress } from '../../lib/retention/ranks';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';
import { useMyRank } from '../../hooks/useRanks';

/**
 * Your rank on your own profile: tier, progress to the next one, and how
 * points are earned. Live, so posting moves the bar at once.
 */
export function RankCard() {
  const { colors, font, fontSizes, radius } = useTheme();
  const { data } = useMyRank();
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const { current, next, fraction, toGo } = rankProgress(data.points);
  const active = isActiveThisWeek(data.lastActiveAt);

  return (
    // alignSelf: the profile header centres its children, which shrank the
    // card to its content and wrapped the tier name ("Contrib-utor").
    <View style={{ alignSelf: 'stretch', marginHorizontal: 16, marginTop: 4, marginBottom: 4, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${current.color}22` }}>
          <Medal color={current.color} size={20} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: fontSizes.body }]}>{ttx(current.name)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
            {data.points} {ttx('points')}{active ? ` · ${ttx('Active this week')}` : ''}
          </Text>
        </View>
      </View>

      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHover, marginTop: 12, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: current.level === 0 ? colors.accent : current.color }} />
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: fontSizes.caption, marginTop: 6 }}>
        {next ? `${toGo} ${ttx('points to')} ${ttx(next.name)}` : ttx('Top rank reached')}
      </Text>

      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <Text style={[font.bodySemibold, { color: colors.accent, fontSize: fontSizes.caption }]}>{ttx('How to earn points')}</Text>
          {open ? <CaretUp color={colors.accent} size={12} weight="bold" /> : <CaretDown color={colors.accent} size={12} weight="bold" />}
        </View>
      </Pressable>
      {open && (
        <View style={{ marginTop: 8, gap: 6 }}>
          {RANK_RULES.map(rule => (
            <View key={rule.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: fontSizes.caption }}>{ttx(rule.label)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{rule.points}</Text>
              <Text style={[font.bodySemibold, { minWidth: 36, textAlign: 'right', color: colors.text, fontSize: fontSizes.caption }]}>{data.breakdown[rule.key] ?? 0}</Text>
            </View>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, lineHeight: 18 }}>
            {ttx('Only interactions from other people count, once per person per post. Ranks never go down.')}
          </Text>
        </View>
      )}
    </View>
  );
}
