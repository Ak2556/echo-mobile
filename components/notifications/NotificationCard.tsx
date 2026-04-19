import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Heart, MessageCircle, UserPlus, Repeat2, AtSign, Mail } from 'lucide-react-native';
import { Notification } from '../../types';

const ICON_MAP = {
  like: { icon: Heart, color: '#EF4444', bg: 'bg-red-900/30' },
  comment: { icon: MessageCircle, color: '#3B82F6', bg: 'bg-blue-900/30' },
  follow: { icon: UserPlus, color: '#10B981', bg: 'bg-green-900/30' },
  repost: { icon: Repeat2, color: '#8B5CF6', bg: 'bg-purple-900/30' },
  mention: { icon: AtSign, color: '#F59E0B', bg: 'bg-amber-900/30' },
  dm: { icon: Mail, color: '#06B6D4', bg: 'bg-cyan-900/30' },
};

const ACTION_TEXT = {
  like: 'liked your echo',
  comment: 'commented on your echo',
  follow: 'started following you',
  repost: 're-echoed your post',
  mention: 'mentioned you',
  dm: 'sent you a message',
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

interface NotificationCardProps {
  notification: Notification;
  onPress: () => void;
}

export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const config = ICON_MAP[notification.type];
  const Icon = config.icon;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-3.5 border-b border-zinc-900 ${!notification.isRead ? 'bg-blue-950/20' : ''}`}
    >
      {/* Icon */}
      <View className={`w-10 h-10 rounded-full ${config.bg} items-center justify-center mr-3`}>
        <Icon color={config.color} size={18} fill={notification.type === 'like' ? config.color : 'transparent'} />
      </View>

      {/* Avatar */}
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: notification.fromAvatarColor }}
      >
        <Text className="text-white font-bold text-sm">
          {notification.fromDisplayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1">
        <Text className="text-white text-sm" numberOfLines={2}>
          <Text className="font-bold">{notification.fromDisplayName}</Text>
          {' '}{ACTION_TEXT[notification.type]}
        </Text>
        {notification.targetPreview && (
          <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
            {notification.targetPreview}
          </Text>
        )}
      </View>

      {/* Time + unread dot */}
      <View className="items-end ml-2">
        <Text className="text-zinc-600 text-xs">{getTimeAgo(notification.createdAt)}</Text>
        {!notification.isRead && <View className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />}
      </View>
    </Pressable>
  );
}
