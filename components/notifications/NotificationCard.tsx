import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeartStraight, ChatCircle, UserPlus, ArrowsClockwise, At, Envelope, BookmarkSimple, Sparkle, Quotes, CheckCircle, ShieldWarning } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { IconBadge } from '../ui/IconBadge';
import { SpeakButton } from '../ui/SpeakButton';
import { Notification } from '../../types';
import { useTheme } from '../../lib/theme';

// Warm editorial palette (lib/avatarPalette.ts) — one hue per notification type.
const TYPE_COLOR: Record<string, string> = {
  like: '#A04E4E',
  comment: '#4E7A8B',
  follow: '#7A8B4E',
  repost: '#4E8B7A',
  mention: '#B08536',
  dm: '#5E748B',
  reaction: '#B35D6B',
  bookmark: '#8B6F4E',
  quote: '#8B5E7D',
  report_resolved: '#7A8B4E',
  content_removed: '#A04E4E',
  appeal_resolved: '#4E7A8B',
};

const REACTION_LABEL: Record<string, string> = {
  mind_blown: 'insightful',
  taking_notes: 'taking notes',
  agree: 'agree',
  disagree: 'rethink',
};

// Notifications with no real actor — they get a standalone type-icon avatar
// rather than a person's photo.
const SYSTEM_TYPES = new Set(['report_resolved', 'content_removed', 'appeal_resolved']);

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
    case 'appeal_resolved': return n.targetPreview ?? 'Your appeal has been reviewed';
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
    case 'appeal_resolved': return <CheckCircle     {...p} />;
    default:                return <HeartStraight   {...p} />;
  }
}

function AvatarWithBadge({ n, color, unread }: { n: Notification; color: string; unread: boolean }) {
  const { colors } = useTheme();
  const isSystem = SYSTEM_TYPES.has(n.type);

  return (
    <View style={{ width: 44, height: 44 }}>
      {isSystem ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
          <NotifIcon type={n.type} size={20} color={color} />
        </View>
      ) : (
        <>
          <Avatar name={n.fromDisplayName || n.fromUsername} color={n.fromAvatarColor} url={n.fromAvatarUrl} size={44} />
          <View style={{
            position: 'absolute', bottom: -2, right: -4,
            width: 22, height: 22, borderRadius: 11,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.bg,
            borderWidth: 2, borderColor: colors.bg,
          }}>
            <NotifIcon type={n.type} size={11} color={color} />
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
  /** In a multi-column grid the row controls the outer gutter/gap, so the
   *  card drops its own horizontal margin and fills its cell. */
  flush?: boolean;
}

export function NotificationCard({ notification, onPress, onLongPress, flush = false }: NotificationCardProps) {
  const { colors, fontSizes } = useTheme();
  const n = notification;
  const unread = !n.isRead;
  const color = TYPE_COLOR[n.type] ?? colors.accent;
  const isSystem = SYSTEM_TYPES.has(n.type);
  const grouped = !!(n.groupCount && n.groupCount > 1);

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      fadeOnPress
      haptic="light"
      style={{
        marginHorizontal: 0,
        backgroundColor: unread ? color + (colors.isDark ? '12' : '0A') : 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.glassBorder,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 18,
        paddingHorizontal: flush ? 0 : 20,
        gap: 16,
      }}
    >
      <AvatarWithBadge n={n} color={color} unread={unread} />

      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Name line + timestamp */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, flex: 1, paddingRight: 12 }} numberOfLines={2}>
            {!isSystem && <Text style={{ fontFamily: 'Inter_700Bold' }}>{n.fromDisplayName || n.fromUsername}</Text>}
            {!isSystem ? ' ' : ''}
            <Text style={{ color: colors.textSecondary }}>{actionTextFor(n)}</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {getTimeAgo(n.createdAt)}
            </Text>
            {unread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />}
          </View>
        </View>

        {/* Spacious, simple quote block */}
        {n.targetEchoPreview && (
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 4, paddingRight: 20 }} numberOfLines={2}>
            &quot;{n.targetEchoPreview}&quot;
          </Text>
        )}

        {/* Non-echo context */}
        {!n.targetEchoPreview && n.targetPreview && n.type !== 'reaction' && !isSystem && !grouped && (
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 4 }} numberOfLines={2}>
            {n.targetPreview}
          </Text>
        )}

        {grouped && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'Inter_500Medium' }}>
              and {(n.groupCount ?? 1) - 1} others
            </Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}
