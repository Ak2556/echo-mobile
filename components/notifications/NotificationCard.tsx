import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeartStraight, ChatCircle, UserPlus, ArrowsClockwise, At, Envelope, BookmarkSimple, Sparkle, Quotes, CheckCircle, ShieldWarning } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { Notification } from '../../types';
import { useTheme } from '../../lib/theme';

const TYPE_COLOR: Record<string, string> = {
  like: '#EF4444',
  comment: '#3B82F6',
  follow: '#10B981',
  repost: '#8B5CF6',
  mention: '#F59E0B',
  dm: '#06B6D4',
  reaction: '#EC4899',
  bookmark: '#EAB308',
  quote: '#8B5CF6',
  report_resolved: '#10B981',
  content_removed: '#EF4444',
};

const REACTION_LABEL: Record<string, string> = {
  mind_blown: 'insightful',
  taking_notes: 'taking notes',
  agree: 'agree',
  disagree: 'rethink',
};

// Notifications with no real actor — they get a standalone type-icon avatar
// rather than a person's photo.
const SYSTEM_TYPES = new Set(['report_resolved', 'content_removed']);

function actionTextFor(n: Notification): string {
  switch (n.type) {
    case 'like': return 'liked your echo';
    case 'comment': return 'commented on your echo';
    case 'follow': return 'started following you';
    case 'repost': return 're-echoed your post';
    case 'mention': return 'mentioned you';
    case 'dm': return 'sent you a message';
    case 'reaction': {
      const label = n.targetPreview ? REACTION_LABEL[n.targetPreview] : '';
      return label ? `reacted: ${label}` : 'reacted to your echo';
    }
    case 'bookmark': return 'saved your echo';
    case 'quote': return 'quoted your echo';
    case 'report_resolved': return n.targetPreview ?? 'Your report has been reviewed';
    case 'content_removed': return n.targetPreview ?? 'Content was removed';
    default: return 'interacted with you';
  }
}

function NotifIcon({ type, size, color }: { type: string; size: number; color: string }) {
  const p = { size, weight: 'fill' as const, color };
  switch (type) {
    case 'like':            return <HeartStraight   {...p} />;
    case 'comment':         return <ChatCircle      {...p} />;
    case 'follow':          return <UserPlus        {...p} />;
    case 'repost':          return <ArrowsClockwise {...p} />;
    case 'mention':         return <At              {...p} />;
    case 'dm':              return <Envelope        {...p} />;
    case 'reaction':        return <Sparkle         {...p} />;
    case 'bookmark':        return <BookmarkSimple  {...p} />;
    case 'quote':           return <Quotes          {...p} />;
    case 'report_resolved': return <CheckCircle     {...p} />;
    case 'content_removed': return <ShieldWarning   {...p} />;
    default:                return <HeartStraight   {...p} />;
  }
}

/** Person's avatar (real photo when available) with a small type-icon badge. */
function AvatarWithBadge({ n }: { n: Notification }) {
  const { colors } = useTheme();
  const color = TYPE_COLOR[n.type] ?? colors.accent;
  const isSystem = SYSTEM_TYPES.has(n.type);

  return (
    <View style={{ width: 44, height: 44, marginRight: 12 }}>
      {isSystem ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}22` }}>
          <NotifIcon type={n.type} size={20} color={color} />
        </View>
      ) : (
        <>
          <Avatar name={n.fromDisplayName || n.fromUsername} color={n.fromAvatarColor} url={n.fromAvatarUrl} size={44} />
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: color,
            borderWidth: 2, borderColor: colors.bg,
          }}>
            <NotifIcon type={n.type} size={11} color="#fff" />
          </View>
        </>
      )}
    </View>
  );
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
  const { colors, fontSizes } = useTheme();
  const unread = !notification.isRead;

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      fadeOnPress
      haptic="light"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: unread ? (colors.isDark ? `${colors.accent}12` : `${colors.accent}0A`) : 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <AvatarWithBadge n={notification} />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.text, fontSize: fontSizes.small, flexShrink: 1 }} numberOfLines={2}>
            {!SYSTEM_TYPES.has(notification.type) && (
              <Text style={{ fontFamily: 'Inter_700Bold' }}>{notification.fromDisplayName}</Text>
            )}
            {!SYSTEM_TYPES.has(notification.type) ? ' ' : ''}{actionTextFor(notification)}
          </Text>
          {notification.groupCount && notification.groupCount > 1 && (
            <View style={{ backgroundColor: colors.accentMuted, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, alignSelf: 'flex-start' }}>
              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.2 }}>
                +{notification.groupCount - 1}
              </Text>
            </View>
          )}
        </View>
        {notification.targetPreview && notification.type !== 'reaction' && !SYSTEM_TYPES.has(notification.type) && (
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 2 }} numberOfLines={1}>
            {notification.targetPreview}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', marginLeft: 8, gap: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{getTimeAgo(notification.createdAt)}</Text>
        {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />}
      </View>
    </AnimatedPressable>
  );
}
