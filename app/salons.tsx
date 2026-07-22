import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Plus, UsersThree, Hash } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { useTheme } from '../lib/theme';
import { fetchSalons, setSalonMembership, type Salon } from '../lib/supabaseEchoApi';
import { showToast } from '../components/ui/Toast';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

/**
 * Salons — topic-based circles. Browse list shows the most popular first,
 * tap into any to see its scoped feed. Owners get the "Manage" affordance
 * on the detail screen.
 */

function SalonsScreenInner() {
  const router = useRouter();
  const { colors } = useTheme();
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchSalons();
      setSalons(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Salons"
        right={
          <AnimatedPressable
            onPress={() => router.push('/create-salon')}
            style={{ padding: 4, marginRight: 6 }}
            scaleValue={0.88}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel="Create salon"
          >
            <Plus color={colors.accent} size={24} weight="bold" />
          </AnimatedPressable>
        }
      />

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : salons.length === 0 ? (
        <View style={{ flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' }}>
          <UsersThree color={colors.textMuted} size={56} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            No salons yet
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Start the first one — a circle of people thinking about a shared topic.
          </Text>
          <AnimatedPressable
            onPress={() => router.push('/create-salon')}
            style={{
              marginTop: 20,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 99,
              backgroundColor: colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
            scaleValue={0.94}
            haptic="medium"
          >
            <Plus color="#fff" size={16} weight="bold" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Start a salon</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.accent} />}
        >
          {salons.map((salon, i) => (
            <Animated.View key={salon.id} entering={FadeInUp.delay(i * 30).duration(220)}>
              <SalonCard salon={salon} onToggle={async (join) => {
                try {
                  await setSalonMembership(salon.id, join);
                  setSalons((prev) => prev.map(s => s.id === salon.id ? { ...s, is_member: join, member_count: join ? s.member_count + 1 : Math.max(0, s.member_count - 1) } : s));
                  showToast(join ? `Joined ${salon.name}` : `Left ${salon.name}`, join ? 'Joined' : 'Left');
                } catch {
                  showToast('Could not update membership', 'Error');
                }
              }} />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SalonCard({ salon, onToggle }: { salon: Salon; onToggle: (join: boolean) => void }) {
  const router = useRouter();
  const { colors, radius } = useTheme();
  return (
    <AnimatedPressable
      onPress={() => router.push({ pathname: '/salon/[slug]', params: { slug: salon.slug } })}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: salon.cover_color,
      }}
      scaleValue={0.98}
      haptic="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{salon.name}</Text>
        <AnimatedPressable
          onPress={(e) => { e?.stopPropagation?.(); onToggle(!salon.is_member); }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 99,
            backgroundColor: salon.is_member ? 'transparent' : colors.accent,
            borderWidth: salon.is_member ? 1 : 0,
            borderColor: colors.border,
          }}
          scaleValue={0.92}
          haptic="medium"
        >
          <Text style={{ color: salon.is_member ? colors.textMuted : '#fff', fontWeight: '700', fontSize: 12 }}>
            {salon.is_member ? 'Joined' : 'Join'}
          </Text>
        </AnimatedPressable>
      </View>
      {salon.description ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 8 }} numberOfLines={2}>
          {salon.description}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <UsersThree color={colors.textMuted} size={13} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{salon.member_count}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Hash color={colors.textMuted} size={13} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{salon.echo_count} echoes</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function SalonsScreen() { return <V2FeatureGuard flag="salons"><SalonsScreenInner /></V2FeatureGuard>; }
