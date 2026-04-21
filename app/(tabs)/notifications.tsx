import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Bell, Checks } from 'phosphor-react-native';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { NotificationSkeleton } from '../../components/ui/Skeleton';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Notification } from '../../types';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAllNotificationsRead, markNotificationRead } = useAppStore();
  const { colors, animation } = useTheme();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

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
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Activity</Text>
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
            <Text style={{
              fontSize: 14, fontWeight: '600', textTransform: 'capitalize',
              color: filter === tab ? '#fff' : colors.textSecondary,
            }}>{tab}</Text>
          </AnimatedPressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <Animated.View entering={animation(FadeIn.duration(300))} className="flex-1">
          <EmptyState
            icon={Bell}
            title={filter === 'unread' ? 'All caught up!' : 'No activity yet'}
            subtitle={filter === 'unread' ? 'You have no unread notifications.' : 'When people interact with your echoes, you\'ll see it here.'}
          />
        </Animated.View>
      ) : (
        <FlashList
          data={filtered}
          renderItem={({ item }) => (
            <NotificationCard notification={item} onPress={() => handlePress(item)} />
          )}
          keyExtractor={item => item.id}
        />
      )}
    </SafeAreaView>
  );
}
