import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList as _FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Bell, Checks } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Notification } from '../../types';
import { usePerformanceProfile } from '../../lib/performance';
import { useResponsiveLayout } from '../../lib/responsive';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  useRemoteNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../hooks/queries/useNotifications';
const FlashList = _FlashList as React.ComponentType<any>;

type SectionHeader = { type: 'header'; label: 'Today' | 'This Week' | 'Earlier' };
type SectionItem = { type: 'item'; data: Notification };
type ListItem = SectionHeader | SectionItem;

const REACTION_LABEL: Record<string, string> = {
  mind_blown: 'insightful',
  taking_notes: 'taking notes',
  agree: 'agree',
  disagree: 'rethink',
};

function labelForType(n: Notification): string {
  switch (n.type) {
    case 'like': return 'liked your echo';
    case 'comment': return 'commented';
    case 'follow': return 'followed you';
    case 'repost': return 're-echoed';
    case 'mention': return 'mentioned you';
    case 'dm': return 'sent a message';
    case 'reaction': {
      const label = n.targetPreview ? REACTION_LABEL[n.targetPreview] : '';
      return label ? `reacted: ${label}` : 'reacted to your echo';
    }
    case 'bookmark': return 'saved your echo';
    case 'quote': return 'quoted your echo';
    case 'report_resolved': return n.targetPreview ?? 'Your report has been reviewed';
    case 'content_removed': return n.targetPreview ?? 'Content was removed by a moderator';
    default: return '';
  }
}

function groupNotifications(notifications: Notification[]): ListItem[] {
  const now = Date.now();
  const dayMs = 86400000;

  const today: Notification[] = [];
  const thisWeek: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    const age = now - new Date(n.createdAt).getTime();
    if (age < dayMs) today.push(n);
    else if (age < 7 * dayMs) thisWeek.push(n);
    else earlier.push(n);
  }

  const result: ListItem[] = [];
  if (today.length > 0) {
    result.push({ type: 'header', label: 'Today' });
    today.forEach(n => result.push({ type: 'item', data: n }));
  }
  if (thisWeek.length > 0) {
    result.push({ type: 'header', label: 'This Week' });
    thisWeek.forEach(n => result.push({ type: 'item', data: n }));
  }
  if (earlier.length > 0) {
    result.push({ type: 'header', label: 'Earlier' });
    earlier.forEach(n => result.push({ type: 'item', data: n }));
  }
  return result;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications: storeNotifications, markAllNotificationsRead, markNotificationRead: storeMarkRead, unreadNotificationCount, mutedIds } = useAppStore();
  const { colors, animation, font } = useTheme();
  const layout = useResponsiveLayout();
  const performance = usePerformanceProfile('hot');
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions' | 'replies' | 'likes' | 'reactions' | 'saves' | 'quotes' | 'follows' | 'reposts'>('all');

  const remote = isSupabaseRemote();
  const { data: remoteNotifications, refetch, isRefetching } = useRemoteNotifications();
  const markAllRemote = useMarkAllNotificationsRead();
  const markOneRemote = useMarkNotificationRead();

  // Resolve notification source: real DB data when remote, seed data otherwise
  const notifications = (remote && remoteNotifications) ? remoteNotifications : storeNotifications;

  // Type filter: each chip narrows by Notification['type'].
  const typeFilter = (n: Notification) => {
    switch (filter) {
      case 'unread': return !n.isRead;
      case 'mentions': return n.type === 'mention';
      case 'replies': return n.type === 'comment';
      case 'likes': return n.type === 'like';
      case 'reactions': return n.type === 'reaction';
      case 'saves': return n.type === 'bookmark';
      case 'quotes': return n.type === 'quote';
      case 'follows': return n.type === 'follow';
      case 'reposts': return n.type === 'repost';
      default: return true;
    }
  };

  // Group by (type, targetId) to collapse repeated actions ("Alice and 11 others liked").
  const groupedFlat = useMemo(() => {
    const visible = notifications.filter(n => !mutedIds.includes(n.fromUserId)).filter(typeFilter);
    type Bucket = { key: string; notifications: Notification[] };
    const buckets = new Map<string, Bucket>();
    for (const n of visible) {
      // Reactions and the preview field together, so distinct reactions on
      // the same echo remain in separate buckets.
      const subkey = n.type === 'reaction' ? `${n.targetId ?? n.fromUserId}:${n.targetPreview ?? ''}` : (n.targetId ?? n.fromUserId);
      const k = `${n.type}:${subkey}`;
      const b = buckets.get(k) ?? { key: k, notifications: [] };
      b.notifications.push(n);
      buckets.set(k, b);
    }
    // Newest first by latest createdAt within bucket.
    return Array.from(buckets.values())
      .map(b => ({ ...b, latest: b.notifications.reduce((acc, x) => x.createdAt > acc ? x.createdAt : acc, b.notifications[0].createdAt) }))
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .flatMap(b => {
        const sample = b.notifications[0];
        if (b.notifications.length === 1) return [sample];
        // Synthesize a grouped notification preserving the most-recent metadata.
        // groupCount drives the +N pill in the row UI so the collapsed
        // count is visible at a glance.
        const others = b.notifications.length - 1;
        return [{
          ...sample,
          groupCount: b.notifications.length,
          targetPreview: `${sample.fromDisplayName || sample.fromUsername} and ${others} other${others > 1 ? 's' : ''} ${labelForType(sample)}`,
        }];
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, mutedIds, filter]); // typeFilter is recreated from `filter` which is already in deps

  const listData = useMemo(() => groupNotifications(groupedFlat), [groupedFlat]);
  // For remote notifications, count unread directly from resolved data
  const unreadCount = remote
    ? notifications.filter(n => !n.isRead).length
    : unreadNotificationCount();

  const useBlur = performance.useBlur;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Header: title row + filter tabs
  const HEADER_CONTENT_HEIGHT = 96;
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={layout.contentStyle}>
          <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted }}>
              {item.label}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={layout.contentStyle}>
        <NotificationCard
          notification={item.data}
          onPress={() => handlePress(item.data)}
          onLongPress={() => useAppStore.getState().toggleMute(item.data.fromUserId)}
        />
      </View>
    );
  };

  const handlePress = (n: Notification) => {
    if (remote) {
      markOneRemote.mutate(n.id);
    } else {
      storeMarkRead(n.id);
    }
    if (n.type === 'follow') {
      router.push(`/user/${n.fromUserId}`);
    } else if (n.targetId) {
      router.push(`/thread/${n.targetId}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient */}

      {/* Content */}
      {groupedFlat.length === 0 ? (
        <Animated.View entering={animation(FadeIn.duration(80))} style={{ flex: 1, paddingTop: headerHeight }}>
          <EmptyState
            icon={<Bell color={colors.accent} size={32} />}
            title={filter === 'unread' ? 'All caught up!' : 'No activity yet'}
            subtitle={
              filter === 'unread'
                ? 'You have no unread notifications.'
                : "When people interact with your echoes, you'll see it here."
            }
            actionLabel={filter === 'all' ? 'Explore' : undefined}
            onAction={filter === 'all' ? () => router.push('/(tabs)/home') : undefined}
          />
        </Animated.View>
      ) : (
        <FlashList
          data={listData}
          keyExtractor={(item: ListItem) =>
            item.type === 'header' ? `header-${item.label}` : `notif-${item.data.id}`
          }
          getItemType={(item: ListItem) => item.type}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={remote ? refetch : () => setFilter(f => f)}
              tintColor={colors.accent}
              progressViewOffset={headerHeight}
            />
          }
        />
      )}

      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlur && (
          <BlurView
            intensity={performance.maxBlurIntensity}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg, opacity: useBlur ? 0.28 : 0.97 },
          ]}
        />

        <View style={[layout.contentStyle, { paddingTop: insets.top + 2 }]}>
        {/* Title row */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[font.displayBlack, { color: colors.text, fontSize: 26 }]}>Activity</Text>
            {unreadCount > 0 && (
              <View
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: 99,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  minWidth: 20,
                  alignItems: 'center',
                }}
              >
                <Text style={[font.bodyBold, { color: '#fff', fontSize: 11 }]}>{unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <AnimatedPressable
              onPress={remote ? () => markAllRemote.mutate() : markAllNotificationsRead}
              performanceMode="hot"
              haptic="medium"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 99,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
              }}
            >
              <Checks color={colors.textSecondary} size={14} />
              <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]}>Read all</Text>
            </AnimatedPressable>
          )}
        </View>

        {/* Filter tabs */}
        <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}>
          {(['all', 'unread', 'mentions', 'replies', 'follows'] as const).map(tab => (
            <AnimatedPressable
              key={tab}
              onPress={() => setFilter(tab)}
              performanceMode="hot"
              haptic="light"
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 99,
                backgroundColor: filter === tab ? colors.accent : 'transparent',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: filter === tab ? 'transparent' : colors.border,
              }}
            >
              <Text
                style={{
                  ...font.bodySemibold,
                  fontSize: 13,
                  textTransform: 'capitalize',
                  color: filter === tab ? '#fff' : colors.textSecondary,
                }}
              >
                {tab}
              </Text>
            </AnimatedPressable>
          ))}
        </Animated.ScrollView>
        </View>

        {/* Bottom border */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }}
        />
      </View>
    </View>
  );
}
