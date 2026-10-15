import React, { useCallback, useEffect, useState } from 'react';
import { useVoiceScreenActions } from '../lib/voice/useVoiceScreenActions';
import { useVoiceScrollTarget } from '../lib/voice/useVoiceScrollTarget';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Microphone, UsersThree, Clock } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/common/EmptyState';
import { HeaderAddButton } from '../components/ui/HeaderAddButton';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { Button } from '../components/ui/Button';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../lib/ui/theme';
import { fetchUpcomingOfficeHours, setOfficeHourRSVP, type OfficeHour } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';
import { ttx } from '../lib/i18n/i18n';
import { LoadingState } from '../components/common/LoadingState';

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

  // Voice can move this list a page at a time; see lib/voice/useVoiceScrollTarget.
  const voiceList = useVoiceScrollTarget();
  useVoiceScreenActions({
    scroll: voiceList.scroll,
  });
  const { colors } = useTheme();
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
    <ResponsiveScreen>
      <ScreenHeader
        title={ttx("Office Hours")}
        right={<HeaderAddButton onPress={() => router.push('/create-office-hour')} label={ttx("Schedule office hour")} />}
      />

      {loading ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon={<Microphone color={colors.textMuted} size={40} />}
            title={ttx("No upcoming Office Hours")}
            subtitle={"Schedule a session. Invite Q's on a topic you know cold."}
            actionLabel={ttx("Schedule")}
            onAction={() => router.push('/create-office-hour')}
          />
        </View>
      ) : (
        <ScrollView
          ref={voiceList.ref as never}
          onScroll={voiceList.onScroll}
          onLayout={voiceList.onLayout}
          scrollEventThrottle={64}
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
                    showToast(going ? `RSVP'd to ${oh.topic}` : 'RSVP removed', going ? 'RSVP' : 'Removed');
                  } catch {
                    setList(prev => prev.map(o => o.id === oh.id ? { ...o, has_rsvp: !going, rsvp_count: going ? Math.max(0, o.rsvp_count - 1) : o.rsvp_count + 1 } : o));
                    showToast('Could not update RSVP', 'Error');
                  }
                }}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </ResponsiveScreen>
  );
}

function OfficeHourCard({ oh, onRSVP }: { oh: OfficeHour; onRSVP: (going: boolean) => void }) {
  const router = useRouter();
  const { colors, radius, fontSizes } = useTheme();
  const liveNow = new Date(oh.starts_at).getTime() <= Date.now() && new Date(oh.ends_at).getTime() > Date.now();
  return (
    <AnimatedPressable
      onPress={() => router.push({ pathname: '/office-hours/[id]', params: { id: oh.id } })}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: liveNow ? colors.danger : colors.border,
      }}
      scaleValue={0.98}
      haptic="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Clock color={liveNow ? colors.danger : colors.accent} size={13} weight={liveNow ? 'fill' : 'regular'} />
          <Text style={{ color: liveNow ? colors.danger : colors.accent, fontSize: fontSizes.caption, fontWeight: '700', letterSpacing: 0.4 }}>
            {liveNow ? 'LIVE' : relativeStart(oh.starts_at).toUpperCase()}
          </Text>
        </View>
        <Button label={oh.has_rsvp ? ttx('Going') : ttx('RSVP')} onPress={() => onRSVP(!oh.has_rsvp)} size="compact" variant={oh.has_rsvp ? 'secondary' : 'primary'} />
      </View>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.body, marginBottom: 4 }}>{oh.topic}</Text>
      {oh.description ? (
        <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, lineHeight: 19, marginBottom: 8 }} numberOfLines={2}>
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
              showHalo={false}
            />
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.meta }}>@{oh.host.username}</Text>
          </>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <UsersThree color={colors.textMuted} size={13} />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.meta }}>{oh.rsvp_count}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function OfficeHoursScreen() { return <V2FeatureGuard flag="officeHours"><OfficeHoursScreenInner /></V2FeatureGuard>; }
