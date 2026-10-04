import React from 'react';
import { View } from 'react-native';
import { Medal } from 'phosphor-react-native';
import { tierByLevel } from '../../../../lib/retention/ranks';
import { ttx } from '../../../shared/lib/i18n';
import { useAuthorRank } from '../api/useRanks';

/**
 * The small tier mark beside an author's name. Nothing for Newcomers: most
 * accounts are Newcomers, and a mark on nearly every name would be noise
 * rather than status.
 */
export function RankMark({ userId, size = 13 }: { userId: string | null | undefined; size?: number }) {
  const { data } = useAuthorRank(userId);
  const tier = tierByLevel(data?.tier);
  if (!data || tier.level < 1) return null;
  return (
    <View accessible accessibilityLabel={`${ttx(tier.name)} ${ttx('rank')}`} style={{ marginLeft: 2 }}>
      <Medal color={tier.color} size={size} weight="fill" />
    </View>
  );
}
