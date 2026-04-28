import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList as _FlashList } from '@shopify/flash-list';
const FlashList = _FlashList as React.ComponentType<any>;
import { useRouter } from 'expo-router';
import { Bell, Checks } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Notification } from '../../types';

type SectionHeader = { type: 'header'; label: 'Today' | 'This Week' | 'Earlier' };
type SectionItem = { type: 'item'; data: Notification };
type ListItem = SectionHeader | SectionItem;

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
  const notifications             = useAppStore(s => s.notifications);
  const markAllNotificationsRead  = useAppStore(s => s.markAllNotificationsRead);
  const markNotificationRead      = useAppStore(s => s.markNotificationRead);
  const unreadNotificationCount   = useAppStore(s => s.unreadNotificationCount);
  const { colors, animation } = useTheme();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const listData = useMemo(() => groupNotifications(filtered), [filtered]);
  const unreadCount = unreadNotificationCount();

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: colors.textMuted }}>
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <NotificationCard notification={item.data} onPress={() => handlePress(item.data)} />
    );
  };

  const handlePress = (n: Notification) => {
    markNotificationRead(n.id);
    if (n.type === 'follow') {
      router.push(`/user/${n.fromUserId}`);
    } else if (n.targetId) {
      router.push(`/thread/${n.targetId}`);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Activity</Text>
          {unreadCount > 0 && (
            <View
              style={{
                backgroundColor: colors.accent,
                borderRadius: 99,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <AnimatedPressable
          onPress={markAllNotificationsRead}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ backgroundColor: colors.surface }}
          scaleValue={0.93}
          haptic="medium"
        >
          <Checks color={colors.accent} size={16} />
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>Read All</Text>
        </AnimatedPressable>
      </View>

      {/* Filter tabs */}
      <View className="flex-row px-4 mb-3 gap-2">
        {(['all', 'unread'] as const).map(tab => (
          <AnimatedPressable
            key={tab}
            onPress={() => setFilter(tab)}
            className="px-4 py-2 rounded-full"
            style={{ backgroundColor: filter === tab ? colors.accent : colors.surface }}
            scaleValue={0.93}
            haptic="light"
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                textTransform: 'capitalize',
                color: filter === tab ? '#fff' : colors.textSecondary,
              }}
            >
              {tab}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <Animated.View entering={animation(FadeIn.duration(80))} className="flex-1">
          <EmptyState
            icon={<Bell color={colors.accent} size={32} />}
            title={filter === 'unread' ? 'All caught up!' : 'No activity yet'}
            subtitle={
              filter === 'unread'
                ? 'You have no unread notifications.'
                : "When people interact with your echoes, you'll see it here."
            }
            actionLabel={filter === 'all' ? 'Explore' : undefined}
            onAction={filter === 'all' ? () => router.push('/(tabs)/discover') : undefined}
          />
        </Animated.View>
      ) : (
        <FlashList
          data={listData}
          keyExtractor={(item: ListItem) =>
            item.type === 'header' ? `header-${item.label}` : `notif-${item.data.id}`
          }
          getItemType={(item: ListItem) => item.type}
          estimatedItemSize={72}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}
