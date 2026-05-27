import React from 'react';
import { View, Text } from 'react-native';
import { HeartStraight, ChatCircle, UserPlus, ArrowsClockwise, At, Envelope, BookmarkSimple, Sparkle, Quotes } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { Notification } from '../../types';
import { useTheme } from '../../lib/theme';

const BG_MAP: Record<string, string> = {
  like: 'rgba(239,68,68,0.15)',
  comment: 'rgba(59,130,246,0.15)',
  follow: 'rgba(16,185,129,0.15)',
  repost: 'rgba(139,92,246,0.15)',
  mention: 'rgba(245,158,11,0.15)',
  dm: 'rgba(6,182,212,0.15)',
  reaction: 'rgba(236,72,153,0.15)',
  bookmark: 'rgba(234,179,8,0.15)',
  quote: 'rgba(139,92,246,0.15)',
};

const REACTION_EMOJI: Record<string, string> = {
  mind_blown: '🤯',
  taking_notes: '📝',
  agree: '💯',
  disagree: '🤔',
};

function actionTextFor(n: Notification): string {
  switch (n.type) {
    case 'like': return 'liked your echo';
    case 'comment': return 'commented on your echo';
    case 'follow': return 'started following you';
    case 'repost': return 're-echoed your post';
    case 'mention': return 'mentioned you';
    case 'dm': return 'sent you a message';
    case 'reaction': {
      const emoji = n.targetPreview ? REACTION_EMOJI[n.targetPreview] : '';
      return emoji ? `reacted with ${emoji}` : 'reacted to your echo';
    }
    case 'bookmark': return 'saved your echo';
    case 'quote': return 'quoted your echo';
    default: return 'interacted with you';
  }
}

function NotifIcon({ type }: { type: string }) {
  const p = { size: 18, weight: 'regular' as const };
  switch (type) {
    case 'like':     return <HeartStraight    {...p} color="#EF4444" />;
    case 'comment':  return <ChatCircle       {...p} color="#3B82F6" />;
    case 'follow':   return <UserPlus         {...p} color="#10B981" />;
    case 'repost':   return <ArrowsClockwise  {...p} color="#8B5CF6" />;
    case 'mention':  return <At               {...p} color="#F59E0B" />;
    case 'dm':       return <Envelope         {...p} color="#06B6D4" />;
    case 'reaction': return <Sparkle          {...p} color="#EC4899" />;
    case 'bookmark': return <BookmarkSimple   {...p} color="#EAB308" />;
    case 'quote':    return <Quotes           {...p} color="#8B5CF6" />;
    default:         return <HeartStraight    {...p} color="#EF4444" />;
  }
}

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
  onLongPress?: () => void;
}

export function NotificationCard({ notification, onPress, onLongPress }: NotificationCardProps) {
  const { colors, fontSizes, showAvatars, radius } = useTheme();
  const bg = BG_MAP[notification.type] ?? 'rgba(239,68,68,0.15)';

  return (
    <View style={{ marginHorizontal: 16, marginVertical: 4 }}>
      <GlassPanel
        variant="light"
        borderRadius={radius.card}
        tintOverride={
          !notification.isRead
            ? (colors.isDark
                ? `${colors.accent}18`
                : `${colors.accent}0F`)
            : undefined
        }
      >
        <AnimatedPressable
          onPress={onPress}
          onLongPress={onLongPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderLeftWidth: !notification.isRead ? 2.5 : 0,
            borderLeftColor: colors.accent,
          }}
          scaleValue={0.98}
          haptic="light"
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              backgroundColor: bg,
            }}
          >
            <NotifIcon type={notification.type} />
          </View>

          {showAvatars && (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                backgroundColor: notification.fromAvatarColor,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                {notification.fromDisplayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.text, fontSize: fontSizes.small, flexShrink: 1 }} numberOfLines={2}>
                <Text style={{ fontWeight: '700' }}>{notification.fromDisplayName}</Text>
                {' '}{actionTextFor(notification)}
              </Text>
              {notification.groupCount && notification.groupCount > 1 && (
                <View style={{
                  backgroundColor: colors.accentMuted,
                  paddingHorizontal: 7,
                  paddingVertical: 1,
                  borderRadius: 999,
                  alignSelf: 'flex-start',
                }}>
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.2 }}>
                    +{notification.groupCount - 1}
                  </Text>
                </View>
              )}
            </View>
            {notification.targetPreview && notification.type !== 'reaction' && (
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>
                {notification.targetPreview}
              </Text>
            )}
          </View>

          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{getTimeAgo(notification.createdAt)}</Text>
            {!notification.isRead && (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                  marginTop: 6,
                }}
              />
            )}
          </View>
        </AnimatedPressable>
      </GlassPanel>
    </View>
  );
}
