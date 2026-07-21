import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeartStraight, ChatCircle, UserPlus, ArrowsClockwise, At, Envelope, BookmarkSimple, Sparkle, Quotes, CheckCircle, ShieldWarning } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { IconBadge } from '../ui/IconBadge';
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
function AvatarWithBadge({ n, color }: { n: Notification; color: string }) {
  const { colors } = useTheme();
  const isSystem = SYSTEM_TYPES.has(n.type);

  return (
    <View style={{ width: 46, height: 46 }}>
      {isSystem ? (
        <IconBadge color={color} size={46} radius={16}>
          <NotifIcon type={n.type} size={21} color="#fff" />
        </IconBadge>
      ) : (
        <>
          <Avatar name={n.fromDisplayName || n.fromUsername} color={n.fromAvatarColor} url={n.fromAvatarUrl} size={46} />
          <View style={{
            position: 'absolute', bottom: -3, right: -3,
            width: 22, height: 22, borderRadius: 11,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: color,
            borderWidth: 2.5, borderColor: colors.bg,
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
      style={{ marginHorizontal: 16, marginBottom: 9 }}
    >
      {/* Card box lives on a plain View — layout props on AnimatedPressable
          get dropped in Release builds (the recurring layout-drop bug). */}
      <View
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          // Unread cards carry a whisper of the type's hue + a matching hairline;
          // read cards are the plain surface — same language as feed/tool cards.
          backgroundColor: unread ? color + (colors.isDark ? '1A' : '10') : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: unread ? color + '55' : colors.glassBorder,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 13,
          paddingHorizontal: 13,
          gap: 12,
        }}
      >
      <AvatarWithBadge n={n} color={color} />

      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Name line + timestamp, so the time is always attached to the row. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: fontSizes.small, lineHeight: 19, flex: 1 }} numberOfLines={2}>
            {!isSystem && <Text style={{ fontFamily: 'Inter_700Bold' }}>{n.fromDisplayName || n.fromUsername}</Text>}
            {!isSystem ? ' ' : ''}
            <Text style={{ color: colors.textSecondary }}>{actionTextFor(n)}</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 1 }}>
            <Text style={{ color: unread ? color : colors.textMuted, fontSize: fontSizes.caption, fontWeight: unread ? '700' : '400' }}>
              {getTimeAgo(n.createdAt)}
            </Text>
            {unread && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />}
          </View>
        </View>

        {/* Grouped count + who-else line. */}
        {grouped && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={{ backgroundColor: color + '26', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ color, fontSize: 10.5, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'], letterSpacing: 0.2 }}>
                +{(n.groupCount ?? 1) - 1} more
              </Text>
            </View>
          </View>
        )}

        {n.targetPreview && n.type !== 'reaction' && !isSystem && !grouped && (
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
            {n.targetPreview}
          </Text>
        )}
      </View>
      </View>
    </AnimatedPressable>
  );
}
