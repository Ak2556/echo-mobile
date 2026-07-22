import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useTheme } from '../lib/theme';
import { fetchBadges, type Badge } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

const TIER_COLOR: Record<Badge['tier'], string> = {
  bronze: '#B45309',
  silver: '#71717A',
  gold: '#EAB308',
  special: '#A855F7',
};

function BadgesScreenInner() {
  const router = useRouter();
  const { colors } = useTheme();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchBadges();
        setBadges(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const earned = badges.filter(b => b.earned);
  const unearned = badges.filter(b => !b.earned);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Badges"
        right={<Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginRight: 10 }}>{earned.length}/{badges.length}</Text>}
      />

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {earned.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 10, marginLeft: 4 }}>Earned</Text>
              {earned.map((b, i) => (
                <Animated.View key={b.id} entering={FadeInUp.delay(i * 30).duration(220)}>
                  <BadgeCard badge={b} />
                </Animated.View>
              ))}
            </>
          )}
          {unearned.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 10, marginTop: earned.length ? 16 : 0, marginLeft: 4 }}>
                Locked
              </Text>
              {unearned.map((b, i) => (
                <Animated.View key={b.id} entering={FadeInUp.delay((earned.length + i) * 30).duration(220)}>
                  <BadgeCard badge={b} locked />
                </Animated.View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BadgeCard({ badge, locked }: { badge: Badge; locked?: boolean }) {
  const { colors, radius } = useTheme();
  const tint = TIER_COLOR[badge.tier];
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: locked ? colors.border : tint + '55',
        opacity: locked ? 0.55 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 48, height: 48, borderRadius: 99,
          backgroundColor: locked ? colors.surfaceHover : tint + '22',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 24 }}>{badge.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{badge.name}</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, backgroundColor: tint + '22' }}>
            <Text style={{ color: tint, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{badge.tier.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
          {badge.description}
        </Text>
      </View>
    </View>
  );
}

export default function BadgesScreen() { return <V2FeatureGuard flag="badges"><BadgesScreenInner /></V2FeatureGuard>; }
