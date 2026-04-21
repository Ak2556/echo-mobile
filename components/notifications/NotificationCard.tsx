import React from 'react';
import { View, Text } from 'react-native';
import { Heart, MessageCircle, UserPlus, Repeat2, AtSign, Mail } from 'lucide-react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Notification } from '../../types';
import { useTheme } from '../../lib/theme';

const ICON_MAP = {
  like: { icon: Heart, color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  comment: { icon: MessageCircle, color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  follow: { icon: UserPlus, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  repost: { icon: Repeat2, color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  mention: { icon: AtSign, color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  dm: { icon: Mail, color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
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
  const { colors, fontSizes, showAvatars, animation } = useTheme();

  return (
    <AnimatedPressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3.5"
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        backgroundColor: !notification.isRead ? colors.accentMuted : 'transparent',
      }}
      scaleValue={0.98}
      haptic="light"
    >
      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: config.bg }}>
        <Icon color={config.color} size={18} fill={notification.type === 'like' ? config.color : 'transparent'} />
      </View>

      {showAvatars && (
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: notification.fromAvatarColor }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
            {notification.fromDisplayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View className="flex-1">
        <Text style={{ color: colors.text, fontSize: fontSizes.small }} numberOfLines={2}>
          <Text style={{ fontWeight: '700' }}>{notification.fromDisplayName}</Text>
          {' '}{ACTION_TEXT[notification.type]}
        </Text>
        {notification.targetPreview && (
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>
            {notification.targetPreview}
          </Text>
        )}
      </View>

      <View className="items-end ml-2">
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{getTimeAgo(notification.createdAt)}</Text>
        {!notification.isRead && <View className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: colors.accent }} />}
      </View>
    </AnimatedPressable>
  );
}
