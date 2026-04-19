import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Bell, CheckCheck } from 'lucide-react-native';
import { NotificationCard } from '../../components/notifications/NotificationCard';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { Notification } from '../../types';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, markAllNotificationsRead, markNotificationRead } = useAppStore();
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
    <SafeAreaView edges={['top']} className="flex-1 bg-black">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-white text-2xl font-bold">Activity</Text>
        <Pressable onPress={markAllNotificationsRead} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900">
          <CheckCheck color="#3B82F6" size={16} />
          <Text className="text-blue-400 text-xs font-semibold">Read All</Text>
        </Pressable>
      </View>

      {/* Filter tabs */}
      <View className="flex-row px-4 mb-3 gap-2">
        {(['all', 'unread'] as const).map(tab => (
          <Pressable
            key={tab}
            onPress={() => setFilter(tab)}
            className={`px-4 py-2 rounded-full ${filter === tab ? 'bg-white' : 'bg-zinc-900'}`}
          >
            <Text className={`text-sm font-semibold capitalize ${filter === tab ? 'text-black' : 'text-zinc-400'}`}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === 'unread' ? 'All caught up!' : 'No activity yet'}
          subtitle={filter === 'unread' ? 'You have no unread notifications.' : 'When people interact with your echoes, you\'ll see it here.'}
        />
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
