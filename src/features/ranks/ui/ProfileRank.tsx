import React from 'react';
import { Text, View } from 'react-native';
import { Medal } from 'phosphor-react-native';
import { isActiveThisWeek, tierByLevel } from '../../../../lib/ranks';
import { useTheme } from '../../../shared/lib/theme';
import { ttx } from '../../../shared/lib/i18n';
import { useAuthorRank } from '../api/useRanks';

/** Another person's tier and "active this week", under their name on their profile. */
export function ProfileRank({ userId }: { userId: string }) {
  const { colors, font, fontSizes } = useTheme();
  const { data } = useAuthorRank(userId);
  if (!data) return null;
  const tier = tierByLevel(data.tier);
  const active = isActiveThisWeek(data.activeAt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${tier.color}22` }}>
        <Medal color={tier.color} size={13} weight="fill" />
        <Text style={[font.bodySemibold, { color: tier.color, fontSize: fontSizes.caption }]}>{ttx(tier.name)}</Text>
      </View>
      {active && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{ttx('Active this week')}</Text>
        </View>
      )}
    </View>
  );
}
