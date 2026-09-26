import React, { useState, useMemo, useEffect } from 'react';
import { useVoiceScreenActions } from '../../lib/voice/useVoiceScreenActions';
import { useVoiceScrollTarget } from '../../lib/voice/useVoiceScrollTarget';
import { View, Text, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList as _FlashList } from '@shopify/flash-list';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Bell, Checks, Trash } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { EdgeGlass } from '../../components/ui/EdgeGlass';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { destinationFor, summaryTextFor } from '../../lib/notifications/presentation';
import { NOTIFICATION_FILTERS, matchesFilter, type NotificationFilter } from '../../lib/notifications/filters';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../src/shared/lib/theme';
import { useI18n } from '../../src/shared/lib/i18n';
import { setReadableNotifications } from '../../lib/voice/readNotifications';
import { Notification } from '../../types';
import { useResponsiveLayout } from '../../src/shared/lib/responsive';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  useRemoteNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDismissNotification,
} from '../../hooks/queries/useNotifications';
const FlashList = _FlashList as React.ComponentType<any>;

type SectionHeader = { type: 'header'; label: 'Today' | 'This Week' | 'Earlier' };
type SectionItem = { type: 'item'; data: Notification };
/** A grid row of up to `columns` notifications (used on wide/tablet layouts). */
type SectionRow = { type: 'row'; data: Notification[] };
type ListItem = SectionHeader | SectionItem | SectionRow;




function groupNotifications(notifications: Notification[], columns: number): ListItem[] {
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

  // On wide layouts, chunk each section's items into grid rows of `columns`;
  // on phone (columns <= 1) each item is its own single-column row.
  const pushSection = (result: ListItem[], label: SectionHeader['label'], items: Notification[]) => {
    if (items.length === 0) return;
    result.push({ type: 'header', label });
    if (columns <= 1) {
      items.forEach(n => result.push({ type: 'item', data: n }));
    } else {
      for (let i = 0; i < items.length; i += columns) {
        result.push({ type: 'row', data: items.slice(i, i + columns) });
      }
    }
  };

  const result: ListItem[] = [];
  pushSection(result, 'Today', today);
  pushSection(result, 'This Week', thisWeek);
  pushSection(result, 'Earlier', earlier);
  return result;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications: storeNotifications, markAllNotificationsRead, markNotificationRead: storeMarkRead, unreadNotificationCount, mutedIds } = useAppStore();
  const { colors, animation, font } = useTheme();
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  // Voice can move and reload this list. It is the screen people most often
  // want read to them, and "scroll down" advances a page rather than dropping
  // them at the end — see lib/voice/useVoiceScrollTarget.
  const voiceList = useVoiceScrollTarget();
  useVoiceScreenActions({
    scroll: voiceList.scroll,
    refresh: () => { void refetch(); },
  });

  const remote = isSupabaseRemote();
  const {
    data: remotePages,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRemoteNotifications();
  // The cache is paged; the screen wants one list.
  const remoteNotifications = useMemo(() => remotePages?.pages.flat(), [remotePages]);
  const markAllRemote = useMarkAllNotificationsRead();
  const markOneRemote = useMarkNotificationRead();
  const dismissOne = useDismissNotification();

  // Resolve notification source: real DB data when remote, seed data otherwise
  const notifications = (remote && remoteNotifications) ? remoteNotifications : storeNotifications;

  // Publish readable rows so the voice "read my notifications" command can read them.
  useEffect(() => {
    setReadableNotifications(notifications.map(n => `${n.fromDisplayName || n.fromUsername || ''} ${summaryTextFor(n.type, n.targetPreview)}`.trim()));
  }, [notifications]);


  // Group by (type, targetId) to collapse repeated actions ("Alice and 11 others liked").
  const groupedFlat = useMemo(() => {
    const visible = notifications
      .filter(n => n.type !== 'dm')
      .filter(n => !mutedIds.includes(n.fromUserId))
      .filter(n => matchesFilter(n, filter));
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
          targetPreview: `${sample.fromDisplayName || sample.fromUsername} and ${others} other${others > 1 ? 's' : ''} ${summaryTextFor(sample.type, sample.targetPreview)}`,
        }];
      });
  }, [notifications, mutedIds, filter]);

  // Wide layouts (tablet/desktop) lay notifications out in a 2-column grid at
  // the wider content width, matching the home feed; phones stay single-column.
  const columns = layout.isWide ? 2 : 1;
  const listContentStyle = layout.isWide ? layout.wideContentStyle : layout.contentStyle;
  const listData = useMemo(() => groupNotifications(groupedFlat, columns), [groupedFlat, columns]);
  // For remote notifications, count unread directly from resolved data
  const unreadCount = remote
    ? notifications.filter(n => !n.isRead).length
    : unreadNotificationCount();

  // Header: title row + filter tabs
  const NAV_BAR_HEIGHT = 56;
  const FILTER_BAR_HEIGHT = 44;
  const HEADER_CONTENT_HEIGHT = layout.isDesktop ? 108 : NAV_BAR_HEIGHT + FILTER_BAR_HEIGHT;
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={listContentStyle}>
          <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 }}>
            <Text style={{ fontSize: 12, ...font.bodySemibold, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted }}>
              {item.label === 'Today' ? t('notif.today') : item.label === 'This Week' ? t('notif.thisWeek') : t('notif.earlier')}
            </Text>
          </View>
        </View>
      );
    }
    if (item.type === 'row') {
      // Wide-layout grid row: cards share the row via flex, the row owns the
      // outer gutter + inter-column gap. A trailing spacer keeps an odd last
      // card at column width instead of stretching full-width.
      return (
        <View style={listContentStyle}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 14 }}>
            {item.data.map(n => (
              <View key={n.id} style={{ flex: 1 }}>
                <NotificationCard
                  notification={n}
                  flush
                  onPress={() => handlePress(n)}
                  onLongPress={() => useAppStore.getState().toggleMute(n.fromUserId)}
                />
              </View>
            ))}
            {item.data.length < columns &&
              Array.from({ length: columns - item.data.length }).map((_, i) => (
                <View key={`spacer-${i}`} style={{ flex: 1 }} />
              ))}
          </View>
        </View>
      );
    }
    return (
      <View style={listContentStyle}>
        {/* Single column only. The wide grid above puts two cards side by side,
            and a horizontal swipe there would be ambiguous about which one it
            meant — and would fight the row's own horizontal layout. */}
        <Swipeable
          overshootRight={false}
          rightThreshold={44}
          renderRightActions={() => (
            <Pressable
              onPress={() => handleDismiss(item.data)}
              style={{ width: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border }}
            >
              <Trash color={colors.textSecondary} size={19} />
              <Text style={{ ...font.bodySemibold, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                {t('notif.dismiss')}
              </Text>
            </Pressable>
          )}
        >
          <NotificationCard
            notification={item.data}
            onPress={() => handlePress(item.data)}
            onLongPress={() => useAppStore.getState().toggleMute(item.data.fromUserId)}
          />
        </Swipeable>
      </View>
    );
  };

  /**
   * Remote dismissal is a soft delete the server owns; locally there is no
   * server, so the store's own removal stands in. Either way the row leaves
   * immediately — the mutation is optimistic.
   */
  const handleDismiss = (n: Notification) => {
    if (remote) dismissOne.mutate(n.id);
    else useAppStore.getState().dismissNotification(n.id);
  };

  const handlePress = (n: Notification) => {
    if (remote) {
      markOneRemote.mutate(n.id);
    } else {
      storeMarkRead(n.id);
    }
    switch (destinationFor(n.type)) {
      case 'profile':
        if (n.fromUserId) router.push(`/user/${n.fromUserId}`);
        break;
      case 'appeal-decision':
        // DSA Art. 17/20: statement of reasons + appeal the moderation decision.
        if (n.targetId) router.push({ pathname: '/appeal', params: { decisionId: n.targetId } });
        break;
      case 'appeal':
        router.push('/appeal');
        break;
      case 'reports':
        router.push('/my-reports');
        break;
      case 'rules':
        router.push('/legal/rules' as never);
        break;
      case 'dm':
        if (n.targetId) router.push(`/messages/${n.targetId}`);
        break;
      case 'daily':
        // targetId here is a daily_answers row, not an echo.
        router.push('/daily-question');
        break;
      case 'thread':
        if (n.targetId) router.push(`/thread/${n.targetId}`);
        break;
      case 'none':
        break;
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
            title={filter === 'unread' ? t('notif.allCaught') : t('notif.noActivity')}
            subtitle={filter === 'unread' ? t('notif.noUnread') : t('notif.emptyBody')}
            actionLabel={filter === 'all' ? t('nav.explore') : undefined}
            onAction={filter === 'all' ? () => router.push('/(tabs)/home') : undefined}
          />
        </Animated.View>
      ) : (
        <FlashList 
          ref={voiceList.ref as never}
          onScroll={voiceList.onScroll}
          onLayout={voiceList.onLayout}
          scrollEventThrottle={64}
          data={listData}
          keyExtractor={(item: ListItem) => {
            if (item.type === 'header') return `header-${item.label}`;
            if (item.type === 'row') return `row-${item.data.map(n => n.id).join('-')}`;
            return `notif-${item.data.id}`;
          }}
          getItemType={(item: ListItem) => item.type}
            renderItem={renderItem}
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: layout.bottomChromePadding }}
          // Older notifications are fetched a page at a time. Half a screen of
          // lead is enough for the next page to land before the user reaches
          // the end, without prefetching history nobody scrolls to.
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (remote && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage
              ? <View style={{ paddingVertical: 20, alignItems: 'center' }}><ActivityIndicator color={colors.textMuted} /></View>
              : null
          }
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

      {/* Screen chrome, not an object.
       *
       * This was a GlassPanel at borderRadius 0 filling an absolute bar, which
       * is the one thing GlassPanel is not for: it draws a border, a rim light
       * and a bevel, and three of this bar's four sides are off-screen. The
       * result read as a slab laid over the list, with a hard horizontal line
       * where it ended. EdgeGlass draws a gradient in depth instead, so the
       * list goes out of focus on its way under the header rather than being
       * cut by it — the same treatment the tab bar and the home header use. */}
      <EdgeGlass edge="top" height={headerHeight} style={{ zIndex: 10 }}>
            <View style={[layout.contentStyle, { paddingTop: insets.top + (layout.isDesktop ? 10 : 0) }]}>
            {/* Title row */}
            <View
              style={{
                paddingHorizontal: layout.gutter,
                paddingBottom: 6,
                height: layout.isDesktop ? 64 : NAV_BAR_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={[font.displayBlack, { color: colors.text, fontSize: 28, letterSpacing: -0.5, marginTop: 2 }]}>{t('notif.title')}</Text>
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
                  <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]}>{t('notif.readAll')}</Text>
                </AnimatedPressable>
              )}
            </View>
    
            {/* Filter tabs */}
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: layout.gutter, gap: 8, paddingBottom: 10, paddingTop: 4 }}>
              {NOTIFICATION_FILTERS.map(({ id: tab, labelKey }) => (
                <Pressable
                  key={tab}
                  onPress={() => setFilter(tab)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 99,
                    backgroundColor: filter === tab ? colors.accent : 'transparent',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: filter === tab ? 'transparent' : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={[
                      font.bodySemibold,
                      {
                        fontSize: 13,
                        textTransform: 'capitalize',
                        color: filter === tab ? '#fff' : colors.textSecondary,
                      }
                    ]}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
            </Animated.ScrollView>
            </View>
    
      </EdgeGlass>
    </View>
  );
}
