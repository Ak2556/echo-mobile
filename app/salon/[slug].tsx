import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Hash, UsersThree } from 'phosphor-react-native';
import { FeedCard } from '../../components/social/FeedCard';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';
import { useTheme } from '../../lib/theme';
import { fetchSalonBySlug, fetchSalonEchoes, setSalonMembership, type Salon } from '../../lib/supabaseEchoApi';
import type { FeedItem } from '../../types';

export default function SalonDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, radius, fontSizes } = useTheme();

  const [salon, setSalon] = useState<Salon | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const s = await fetchSalonBySlug(slug);
      setSalon(s);
      if (s) {
        const echoes = await fetchSalonEchoes(s.id);
        setFeed(echoes);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!salon) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88}>
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
        </View>
        <View style={{ padding: 24, alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }}>
            Salon not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleToggleMembership = async () => {
    const next = !salon.is_member;
    setSalon(prev => prev ? { ...prev, is_member: next, member_count: next ? prev.member_count + 1 : Math.max(0, prev.member_count - 1) } : prev);
    try {
      await setSalonMembership(salon.id, next);
      showToast(next ? `Joined ${salon.name}` : `Left ${salon.name}`, next ? '🏛️' : '👋');
    } catch (e) {
      // Rollback
      setSalon(prev => prev ? { ...prev, is_member: !next, member_count: next ? Math.max(0, prev.member_count - 1) : prev.member_count + 1 } : prev);
      showToast('Could not update membership', '⚠️');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: salon.cover_color, marginRight: 8 }} />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, flex: 1 }} numberOfLines={1}>
          {salon.name}
        </Text>
        <AnimatedPressable
          onPress={() => void handleToggleMembership()}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 6,
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

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.accent} />}
      >
        {/* Salon header card */}
        <Animated.View
          entering={FadeInUp.springify().damping(18).stiffness(140)}
          style={{
            margin: 16,
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            borderLeftWidth: 4,
            borderLeftColor: salon.cover_color,
          }}
        >
          {salon.description ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>
              {salon.description}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: salon.topic_tags?.length ? 10 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <UsersThree color={colors.textMuted} size={13} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{salon.member_count} members</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Hash color={colors.textMuted} size={13} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{salon.echo_count} echoes</Text>
            </View>
          </View>
          {salon.topic_tags && salon.topic_tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {salon.topic_tags.map(tag => (
                <View key={tag} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: salon.cover_color + '22' }}>
                  <Text style={{ color: salon.cover_color, fontSize: 11, fontWeight: '600' }}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Scoped feed */}
        {feed.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
              No echoes in this salon yet. {salon.is_member ? 'Be the first.' : 'Join to post here.'}
            </Text>
          </View>
        ) : (
          feed.map((item, index) => <FeedCard key={item.id} item={item} index={index} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
