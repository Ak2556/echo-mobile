import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Microphone, Plus, UsersThree, Clock } from 'phosphor-react-native';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../lib/theme';
import { fetchUpcomingOfficeHours, setOfficeHourRSVP, type OfficeHour } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

/**
 * Office Hours — scheduled AMA sessions on a creator's profile.
 * Browse list shows upcoming + live sessions sorted by start time.
 */

function relativeStart(starts_at: string): string {
  const diff = new Date(starts_at).getTime() - Date.now();
  if (diff < 0) return 'Live now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `In ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours}h`;
  const days = Math.round(hours / 24);
  return `In ${days}d`;
}

function OfficeHoursScreenInner() {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const [list, setList] = useState<OfficeHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchUpcomingOfficeHours();
      setList(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Office Hours</Text>
        <AnimatedPressable
          onPress={() => router.push('/create-office-hour' as any)}
          style={{ padding: 4 }}
          scaleValue={0.88}
          haptic="medium"
        >
          <Plus color={colors.accent} size={24} weight="bold" />
        </AnimatedPressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={{ flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Microphone color={colors.textMuted} size={48} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            No upcoming Office Hours
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            {"Schedule a session — invite Q's on a topic you know cold."}
          </Text>
          <AnimatedPressable
            onPress={() => router.push('/create-office-hour' as any)}
            style={{ marginTop: 20, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            scaleValue={0.94}
            haptic="medium"
          >
            <Plus color="#fff" size={16} weight="bold" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Schedule</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.accent} />}
        >
          {list.map((oh, i) => (
            <Animated.View key={oh.id} entering={FadeInUp.delay(i * 30).duration(220)}>
              <OfficeHourCard
                oh={oh}
                onRSVP={async (going) => {
                  // Optimistic
                  setList(prev => prev.map(o => o.id === oh.id ? { ...o, has_rsvp: going, rsvp_count: going ? o.rsvp_count + 1 : Math.max(0, o.rsvp_count - 1) } : o));
                  try {
                    await setOfficeHourRSVP(oh.id, going);
                    showToast(going ? `RSVP'd to ${oh.topic}` : 'RSVP removed', going ? '🎙️' : '👋');
                  } catch (e) {
                    setList(prev => prev.map(o => o.id === oh.id ? { ...o, has_rsvp: !going, rsvp_count: going ? Math.max(0, o.rsvp_count - 1) : o.rsvp_count + 1 } : o));
                    showToast('Could not update RSVP', '⚠️');
                  }
                }}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OfficeHourCard({ oh, onRSVP }: { oh: OfficeHour; onRSVP: (going: boolean) => void }) {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const liveNow = new Date(oh.starts_at).getTime() <= Date.now() && new Date(oh.ends_at).getTime() > Date.now();
  return (
    <AnimatedPressable
      onPress={() => router.push(`/office-hours/${oh.id}` as any)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: liveNow ? '#EF4444' : colors.border,
      }}
      scaleValue={0.98}
      haptic="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Clock color={liveNow ? '#EF4444' : colors.accent} size={13} weight={liveNow ? 'fill' : 'regular'} />
          <Text style={{ color: liveNow ? '#EF4444' : colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>
            {liveNow ? 'LIVE' : relativeStart(oh.starts_at).toUpperCase()}
          </Text>
        </View>
        <AnimatedPressable
          onPress={(e) => { e?.stopPropagation?.(); onRSVP(!oh.has_rsvp); }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 99,
            backgroundColor: oh.has_rsvp ? 'transparent' : colors.accent,
            borderWidth: oh.has_rsvp ? 1 : 0,
            borderColor: colors.border,
          }}
          scaleValue={0.92}
          haptic="medium"
        >
          <Text style={{ color: oh.has_rsvp ? colors.textMuted : '#fff', fontWeight: '700', fontSize: 12 }}>
            {oh.has_rsvp ? 'Going' : 'RSVP'}
          </Text>
        </AnimatedPressable>
      </View>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>{oh.topic}</Text>
      {oh.description ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 8 }} numberOfLines={2}>
          {oh.description}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {oh.host && (
          <>
            <ProfileAvatar
              displayName={oh.host.display_name}
              avatarColor={oh.host.avatar_color}
              avatarUrl={oh.host.avatar_url ?? undefined}
              size={22}
              showGlow={false}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>@{oh.host.username}</Text>
          </>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <UsersThree color={colors.textMuted} size={13} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{oh.rsvp_count}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function OfficeHoursScreen() { return <V2FeatureGuard flag="officeHours"><OfficeHoursScreenInner /></V2FeatureGuard>; }
