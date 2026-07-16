import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, FlatList,
  TextInput as RNTextInput, Pressable, StyleSheet, Modal,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '../../lib/safeBack';
import {
  ArrowLeft, PaperPlaneTilt, Quotes, SealCheck,
  Sparkle, Copy, Trash, ArrowBendUpLeft, PencilSimple,
  PushPin, X, ArrowFatLinesUp,
  Camera, Plus, LinkSimple, UserCircle, Images, MagnifyingGlass,
  Microphone, Play, Pause, ShareFat, WarningCircle, Users,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import Animated, {
  FadeIn, FadeOut, SlideInDown, SlideOutDown,
  runOnJS, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { showToast } from '../../components/ui/Toast';
import { Avatar } from '../../components/ui/Avatar';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  useRemoteMessages,
  useSendRemoteDM,
  useSendImageDM,
  useSendVoiceDM,
  useSendLinkDM,
  useSendContactDM,
  useSendEchoDM,
  useEditMessage,
  usePinMessage,
  useRemoteConversation,
  useMarkRead,
  useDeleteMessage,
  useToggleReaction,
  useTypingIndicator,
  useDiscardLocalMessage,
  useForwardMessage,
  useRemoteConversations,
} from '../../hooks/queries/useDMs';
import { markMessagesRead } from '../../lib/supabaseEchoApi';
import { usePresenceTracking } from '../../lib/presence';
import type { RemoteMessageReaction } from '../../lib/supabaseEchoApi';
import type { Conversation, DirectMessage } from '../../types';
import { userUrl } from '../../lib/echoUrl';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['❤️', '👍', '😂', '💪', '💡', '🔥'];

const QUICK_STARTERS: Record<string, string> = {
  followup: 'Curious what part of this stood out to you most?',
  summary:  'My short take: this Echo felt especially useful because ',
  draft:    'This could probably turn into a follow-up Echo about ',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedMessage {
  id: string;
  senderId: string;
  content: string | null;
  createdAt: string;
  isRead: boolean;
  deletedAt: string | null;
  editedAt: string | null;
  kind: string;
  sharedEchoId: string | null;
  sharedEchoTitle: string | null;
  sharedEchoPreview: string | null;
  sharedEchoAuthor: string | null;
  mediaUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkSubtitle: string | null;
  contactUserId: string | null;
  contactUsername: string | null;
  contactDisplayName: string | null;
  contactAvatarColor: string | null;
  replyToId: string | null;
  replyToContent: string | null;
  replyToSenderId: string | null;
  replyToKind: string | null;
  replyToDeleted: boolean;
  reactions: RemoteMessageReaction[];
}

type ChatConversation = Conversation & {
  isGroup?: boolean;
  memberCount?: number;
};

function tryParsePayload(content: string | null): Record<string, unknown> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - msgDay.getTime()) / (24 * 3600 * 1000));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

function isGroupedWithPrev(msg: NormalizedMessage, prev: NormalizedMessage | undefined): boolean {
  if (!prev || msg.senderId !== prev.senderId) return false;
  if (prev.deletedAt || msg.deletedAt) return false;
  const gap = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return gap < 3 * 60 * 1000;
}

function messageSearchText(message: NormalizedMessage): string {
  return [
    message.content,
    message.sharedEchoTitle,
    message.sharedEchoPreview,
    message.sharedEchoAuthor,
    message.linkUrl,
    message.linkTitle,
    message.linkSubtitle,
    message.contactDisplayName,
    message.contactUsername,
    message.kind === 'image' ? 'photo image picture' : '',
    message.kind === 'link' ? 'link url website' : '',
    message.kind === 'contact' ? 'contact profile user' : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

// ─── EchoShareCard ────────────────────────────────────────────────────────────

function EchoShareCard({ title, preview, author }: { title: string; preview: string; author?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{
      padding: 12, borderRadius: radius.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      marginTop: 4,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Quotes color={colors.accent} size={14} />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }} numberOfLines={3}>{preview}</Text>
      {author ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>From {author}</Text> : null}
    </View>
  );
}

function LinkShareCard({ url, title, subtitle }: { url: string; title?: string | null; subtitle?: string | null }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{
      padding: 12, borderRadius: radius.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      marginTop: 4, minWidth: 210,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <LinkSimple color={colors.accent} size={15} weight="bold" />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>
          {title || urlHost(url)}
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
        {subtitle || urlHost(url)}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }} numberOfLines={1}>
        {url}
      </Text>
    </View>
  );
}

function ContactShareCard({
  displayName, username, avatarColor,
}: { displayName: string; username: string; avatarColor: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 11,
      padding: 12, borderRadius: radius.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      marginTop: 4, minWidth: 220,
    }}>
      <Avatar name={displayName} color={avatarColor} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          @{username}
        </Text>
      </View>
      <UserCircle color={colors.accent} size={20} weight="bold" />
    </View>
  );
}

// ─── ReplyCard ────────────────────────────────────────────────────────────────

function ReplyCard({
  content, kind, isDeleted, isMe,
}: { content: string | null; kind: string | null; isDeleted: boolean; isMe: boolean }) {
  const { colors, radius } = useTheme();
  const preview = isDeleted
    ? 'Deleted message'
    : kind === 'image' ? '📷 Photo'
    : kind === 'voice' ? '🎙️ Voice message'
    : kind === 'link' ? '🔗 Link'
    : kind === 'contact' ? '👤 Contact'
    : (content ?? '').slice(0, 80);

  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: radius.card - 4, marginBottom: 4,
      backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : colors.surfaceHover,
      borderLeftWidth: 2.5, borderLeftColor: isMe ? 'rgba(255,255,255,0.6)' : colors.accent,
    }}>
      <Text style={{
        color: isMe ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
        fontSize: 12, lineHeight: 16,
        fontStyle: isDeleted ? 'italic' : 'normal',
      }} numberOfLines={2}>
        {preview}
      </Text>
    </View>
  );
}

// ─── ReactionBar ─────────────────────────────────────────────────────────────

function ReactionBar({
  reactions, myUserId, onToggle,
}: {
  reactions: RemoteMessageReaction[];
  myUserId: string;
  onToggle: (reactionValue: string, hasReacted: boolean) => void;
}) {
  const { colors } = useTheme();
  if (!reactions.length) return null;

  const grouped: Record<string, { count: number; hasReacted: boolean }> = {};
  for (const r of reactions) {
    if (!grouped[r.value]) grouped[r.value] = { count: 0, hasReacted: false };
    grouped[r.value].count++;
    if (r.userId === myUserId) grouped[r.value].hasReacted = true;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {Object.entries(grouped).map(([val, { count, hasReacted }]) => (
        <Pressable
          key={val}
          onPress={() => onToggle(val, hasReacted)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
            backgroundColor: hasReacted ? colors.accentMuted : colors.surface,
            borderWidth: 1, borderColor: hasReacted ? colors.accent : colors.border,
          }}
        >
          <Text style={{ fontSize: 14 }}>{val}</Text>
          {count > 1 && (
            <Text style={{ fontSize: 11, fontWeight: '600', color: hasReacted ? colors.accent : colors.textMuted }}>
              {count}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// ─── TypingDots ───────────────────────────────────────────────────────────────

function TypingDots() {
  const { colors, radius } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: 'flex-start' }}>
      <View style={{
        paddingHorizontal: 16, paddingVertical: 11,
        borderRadius: radius.card, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border,
      }}>
        <Text style={{ color: colors.textMuted, fontSize: 20, letterSpacing: 3, lineHeight: 22 }}>···</Text>
      </View>
    </View>
  );
}

// ─── DateSeparator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <Text style={{
        color: colors.textMuted, fontSize: 11, fontWeight: '600',
        marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
    </View>
  );
}

// ─── PinnedMessageBanner ─────────────────────────────────────────────────────

function PinnedMessageBanner({
  content, kind, onUnpin,
}: { content: string | null; kind: string; onUnpin: () => void }) {
  const { colors } = useTheme();
  const label = kind === 'image'
    ? '📷 Photo'
    : kind === 'voice'
      ? '🎙️ Voice'
      : kind === 'link'
        ? '🔗 Link'
        : kind === 'contact'
          ? '👤 Contact'
          : (content ?? '');
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 9,
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      }}
    >
      <PushPin color={colors.accent} size={13} weight="fill" />
      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
        <Text style={{ fontWeight: '700', color: colors.text }}>Pinned: </Text>{label}
      </Text>
      <Pressable onPress={onUnpin} hitSlop={10}>
        <X color={colors.textMuted} size={14} />
      </Pressable>
    </Animated.View>
  );
}

// ─── VoiceBubble ─────────────────────────────────────────────────────────────

function fmtVoiceTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VoiceBubble({ url, durationSec, isMe, pending, onLongPress }: {
  url: string;
  durationSec: number;
  isMe: boolean;
  pending: boolean;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => () => {
    subRef.current?.remove();
    playerRef.current?.remove();
  }, []);

  const stop = () => {
    subRef.current?.remove(); subRef.current = null;
    playerRef.current?.remove(); playerRef.current = null;
    setPlaying(false);
    setPosition(0);
  };

  const toggle = async () => {
    if (playing) { stop(); return; }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createAudioPlayer({ uri: url });
      subRef.current = player.addListener('playbackStatusUpdate', status => {
        if (typeof status.currentTime === 'number') setPosition(status.currentTime);
        if (status.didJustFinish) stop();
      });
      player.play();
      playerRef.current = player;
      setPlaying(true);
    } catch {
      stop();
    }
  };

  const fg = isMe ? '#fff' : colors.text;
  const track = isMe ? 'rgba(255,255,255,0.3)' : (colors.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)');
  const fill = isMe ? '#fff' : colors.accent;
  const progress = durationSec > 0 ? Math.min(1, position / durationSec) : 0;

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        borderRadius: 20, minWidth: 190,
        backgroundColor: isMe ? colors.accent : colors.surfaceHover,
        opacity: pending ? 0.75 : 1,
      }}>
        <Pressable
          onPress={toggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
          style={{
            width: 34, height: 34, borderRadius: 17,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : colors.accent + '22',
          }}
        >
          {playing
            ? <Pause color={fg} size={15} weight="fill" />
            : <Play color={isMe ? '#fff' : colors.accent} size={15} weight="fill" />}
        </Pressable>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ height: 3.5, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: fill, borderRadius: 2 }} />
          </View>
          <Text style={{ color: isMe ? 'rgba(255,255,255,0.85)' : colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
            {playing ? fmtVoiceTime(position) : fmtVoiceTime(durationSec)}
          </Text>
        </View>
        <Microphone color={isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted} size={14} weight="fill" />
      </View>
    </Pressable>
  );
}

// ─── DMBubble ────────────────────────────────────────────────────────────────

function DMBubble({
  message, isMe, showReadReceipt, myUserId, grouped,
  onLongPress, onReactionToggle, onReplyPress, onImagePress, onSwipeReply, onRetry,
}: {
  message: NormalizedMessage;
  isMe: boolean;
  showReadReceipt: boolean;
  myUserId: string;
  grouped: boolean;
  onLongPress: () => void;
  onReactionToggle: (val: string, hasReacted: boolean) => void;
  onReplyPress: (replyToId: string) => void;
  onImagePress?: (url: string) => void;
  onSwipeReply?: () => void;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const fontSizeSetting = useAppStore(s => s.fontSize);
  const { colors, radius } = useTheme();
  const textSize = ({ small: 14, medium: 16, large: 18 } as Record<string, number>)[fontSizeSetting] ?? 16;
  const isDeleted = !!message.deletedAt;
  const isFailed = message.id.startsWith('failed-');

  // Swipe-to-reply: drag the bubble toward the center; past the threshold a
  // reply is armed and springs back. Own messages swipe left, others right.
  const tx = useSharedValue(0);
  const SWIPE_MAX = 72;
  const SWIPE_TRIGGER = 52;
  const canSwipe = !isDeleted && !isFailed && !message.id.startsWith('pending-') && !!onSwipeReply;
  const swipePan = Gesture.Pan()
    .enabled(canSwipe)
    .activeOffsetX(isMe ? [-16, 9999] : [-9999, 16])
    .failOffsetY([-14, 14])
    .onUpdate(e => {
      const raw = isMe ? Math.min(0, e.translationX) : Math.max(0, e.translationX);
      const capped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, raw));
      tx.value = capped;
    })
    .onEnd(() => {
      if (Math.abs(tx.value) >= SWIPE_TRIGGER && onSwipeReply) runOnJS(onSwipeReply)();
      tx.value = withSpring(0, { damping: 18, stiffness: 220 });
    });
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const replyHintStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(tx.value) / SWIPE_TRIGGER),
  }));

  const bubbleBg = isMe ? colors.accent : colors.surface;
  const textColor = isMe ? '#fff' : colors.text;

  const renderContent = () => {
    if (isDeleted) {
      return (
        <View style={{
          paddingHorizontal: 14, paddingVertical: 10,
          borderRadius: radius.card, backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Text style={{ color: colors.textMuted, fontSize: textSize * 0.88, fontStyle: 'italic' }}>
            This message was deleted
          </Text>
        </View>
      );
    }

    if (message.kind === 'image' && message.mediaUrl) {
      return (
        <Pressable
          onPress={() => onImagePress?.(message.mediaUrl!)}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
          <View style={{ borderRadius: radius.card, overflow: 'hidden' }}>
            {message.replyToId && (
              <ReplyCard
                content={message.replyToContent}
                kind={message.replyToKind}
                isDeleted={message.replyToDeleted}
                isMe={isMe}
              />
            )}
            <Image
              source={{ uri: message.mediaUrl }}
              style={{ width: 220, height: 165, borderRadius: radius.card }}
              contentFit="cover"
              transition={200}
            />
          </View>
        </Pressable>
      );
    }

    if (message.kind === 'voice' && message.mediaUrl) {
      return (
        <VoiceBubble
          url={message.mediaUrl}
          durationSec={Number(message.content) || 0}
          isMe={isMe}
          pending={message.id.startsWith('pending-')}
          onLongPress={onLongPress}
        />
      );
    }

    if (message.kind === 'echo' && message.sharedEchoTitle) {
      return (
        <Pressable
          onPress={() => {
            if (message.sharedEchoId) router.push(`/thread/${message.sharedEchoId}`);
          }}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
          <EchoShareCard
            title={message.sharedEchoTitle}
            preview={message.sharedEchoPreview ?? ''}
            author={message.sharedEchoAuthor ?? undefined}
          />
        </Pressable>
      );
    }

    if (message.kind === 'link' && message.linkUrl) {
      return (
        <Pressable
          onPress={() => void Linking.openURL(message.linkUrl!)}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
          <LinkShareCard
            url={message.linkUrl}
            title={message.linkTitle}
            subtitle={message.linkSubtitle}
          />
        </Pressable>
      );
    }

    if (message.kind === 'contact' && message.contactUsername && message.contactDisplayName) {
      return (
        <Pressable
          onPress={() => router.push(`/user/${message.contactUserId || message.contactUsername}`)}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
          <ContactShareCard
            displayName={message.contactDisplayName}
            username={message.contactUsername}
            avatarColor={message.contactAvatarColor ?? colors.accent}
          />
        </Pressable>
      );
    }

    if (message.content) {
      return (
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
          <View style={{
            paddingHorizontal: 15, paddingVertical: 11,
            borderRadius: 20,
            backgroundColor: isMe ? bubbleBg : colors.surfaceHover,
          }}>
            {message.replyToId && (
              <ReplyCard
                content={message.replyToContent}
                kind={message.replyToKind}
                isDeleted={message.replyToDeleted}
                isMe={isMe}
              />
            )}
            <Text style={{ color: textColor, fontSize: textSize, lineHeight: textSize * 1.38 }}>
              {message.content}
            </Text>
          </View>
        </Pressable>
      );
    }

    return null;
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: grouped ? 1 : 4, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      <GestureDetector gesture={swipePan}>
        <Animated.View style={[{ maxWidth: '82%' }, swipeStyle]}>
          {canSwipe && (
            <Animated.View
              pointerEvents="none"
              style={[{
                position: 'absolute',
                top: 0, bottom: 0,
                [isMe ? 'right' : 'left']: -34,
                justifyContent: 'center',
              }, replyHintStyle]}
            >
              <ArrowBendUpLeft color={colors.accent} size={18} weight="bold" />
            </Animated.View>
          )}
          {renderContent()}

          {!isDeleted && message.reactions.length > 0 && (
            <ReactionBar
              reactions={message.reactions}
              myUserId={myUserId}
              onToggle={onReactionToggle}
            />
          )}
        </Animated.View>
      </GestureDetector>

      {isFailed ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 2 }}>
            <WarningCircle color="#EF4444" size={12} weight="fill" />
            <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>Failed to send — tap to retry</Text>
          </View>
        </Pressable>
      ) : !grouped && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, marginHorizontal: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{formatTime(message.createdAt)}</Text>
          {message.editedAt && !isDeleted && (
            <Text style={{ color: colors.textMuted, fontSize: 10, fontStyle: 'italic' }}>Edited</Text>
          )}
          {isMe && message.id.startsWith('pending-') && (
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Sending…</Text>
          )}
          {isMe && showReadReceipt && message.isRead && !isDeleted && (
            <Text style={{ color: colors.accent, fontSize: 10 }}>Read</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── UnreadDivider ───────────────────────────────────────────────────────────

function UnreadDivider() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accent + '66' }} />
      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>NEW MESSAGES</Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accent + '66' }} />
    </View>
  );
}

// ─── ForwardSheet ────────────────────────────────────────────────────────────

function ForwardSheet({ visible, currentConversationId, onSelect, onClose }: {
  visible: boolean;
  currentConversationId: string | undefined;
  onSelect: (recipientId: string, displayName: string) => void;
  onClose: () => void;
}) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: conversations = [] } = useRemoteConversations();
  const targets = conversations.filter(c => c.id !== currentConversationId && !c.archived && !c.isGroup && c.otherUserId);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(200)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
        exiting={reduceAnimations ? undefined : SlideOutDown.duration(180)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          maxHeight: 420,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          backgroundColor: colors.surface,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
          overflow: 'hidden',
        }}
      >
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', paddingHorizontal: 20, paddingBottom: 10 }}>
          Forward to…
        </Text>
        {targets.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 18 }}>
            No other conversations yet.
          </Text>
        ) : (
          <FlatList
            data={targets}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { if (item.otherUserId) onSelect(item.otherUserId, item.otherDisplayName); onClose(); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 20, paddingVertical: 12,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Avatar
                  name={item.otherDisplayName}
                  color={item.otherAvatarColor}
                  url={item.isGroup ? undefined : item.otherAvatarUrl}
                  size={40}
                >
                  {item.isGroup ? <Users color="#fff" size={17} weight="fill" /> : undefined}
                </Avatar>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                    {item.otherDisplayName}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                    @{item.otherUsername}
                  </Text>
                </View>
                <ShareFat color={colors.accent} size={17} weight="fill" />
              </Pressable>
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── MessageActionSheet ───────────────────────────────────────────────────────

function MessageActionSheet({
  visible, message, isOwn, myUserId, isPinned,
  onClose, onCopy, onDelete, onReact, onReply, onEdit, onPin, onForward,
}: {
  visible: boolean;
  message: NormalizedMessage | null;
  isOwn: boolean;
  myUserId: string;
  isPinned: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReact: (val: string, hasReacted: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onForward: () => void;
}) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const isDeleted = !!message.deletedAt;
  const isText = message.kind === 'text' && !isDeleted;

  const Row = ({
    icon, label, destructive, onPress, bordered = true,
  }: {
    icon: React.ReactNode; label: string; destructive?: boolean;
    onPress: () => void; bordered?: boolean;
  }) => (
    <Pressable
      onPress={() => { onPress(); onClose(); }}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        opacity: pressed ? 0.6 : 1,
        borderTopWidth: bordered ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.border,
      })}
    >
      <View style={{ width: 28, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        {icon}
      </View>
      <Text
        style={{ flex: 1, color: destructive ? '#ef4444' : colors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' }}
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(200)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
        exiting={reduceAnimations ? undefined : SlideOutDown.duration(180)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 18,
        }}
      >
        {/* Emoji quick-react strip */}
        {!isDeleted && (
          <View style={{
            borderRadius: 18, overflow: 'hidden', marginBottom: 8,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            backgroundColor: colors.surface,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 4 }}>
              {QUICK_REACTIONS.map(emoji => {
                const alreadyReacted = message.reactions.some(r => r.value === emoji && r.userId === myUserId);
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => { onReact(emoji, alreadyReacted); onClose(); }}
                    style={({ pressed }) => ({
                      width: 46, height: 46, borderRadius: 23,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: alreadyReacted ? colors.accentMuted : 'transparent',
                      opacity: pressed ? 0.6 : 1,
                      borderWidth: alreadyReacted ? 1 : 0,
                      borderColor: colors.accent,
                    })}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={{
          borderRadius: 18, overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
          backgroundColor: colors.surface,
        }}>
          {!isDeleted && (
            <Row icon={<ArrowBendUpLeft color={colors.text} size={18} />} label="Reply" onPress={onReply} bordered={false} />
          )}
          {isText && (
            <Row icon={<Copy color={colors.text} size={18} />} label="Copy" onPress={onCopy} />
          )}
          {!isDeleted && !message.id.startsWith('pending-') && !message.id.startsWith('failed-') && (
            <Row icon={<ShareFat color={colors.text} size={18} />} label="Forward" onPress={onForward} />
          )}
          {isText && isOwn && (
            <Row icon={<PencilSimple color={colors.text} size={18} />} label="Edit" onPress={onEdit} />
          )}
          {!isDeleted && (
            <Row
              icon={<PushPin color={colors.text} size={18} weight={isPinned ? 'fill' : 'regular'} />}
              label={isPinned ? 'Unpin' : 'Pin'}
              onPress={onPin}
            />
          )}
          {isOwn && !isDeleted && (
            <Row icon={<Trash color="#ef4444" size={18} />} label="Delete" destructive onPress={onDelete} />
          )}
        </View>

        {/* Cancel */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            marginTop: 8, borderRadius: 18, overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            minHeight: 54, alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }} maxFontSizeMultiplier={1.15}>
            Cancel
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ─── DMScreen ─────────────────────────────────────────────────────────────────

export default function DMScreen() {
  const { id, echoId, echoTitle, echoPreview, echoAuthor } = useLocalSearchParams<{
    id: string;
    echoId?: string;
    echoTitle?: string;
    echoPreview?: string;
    echoAuthor?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    conversations, getDMs, sendDM, markConversationRead,
    sendDMImage: sendLocalImage,
    sendDMLink: sendLocalLink,
    shareContactInDM,
    shareEchoInDM, userId,
  } = useAppStore();
  const hapticEnabled = useAppStore(s => s.hapticEnabled);
  const readReceipts = useAppStore(s => s.readReceipts);
  const { colors, radius, isUserOnline, reduceAnimations } = useTheme();

  const [text, setText] = useState('');
  const [sharedPending, setSharedPending] = useState(Boolean(echoId));
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [activeMessage, setActiveMessage] = useState<NormalizedMessage | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<NormalizedMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<NormalizedMessage | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Voice recording
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startVoiceRecording = useCallback(async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone needed', 'Allow microphone access to send voice messages.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordSec(0);
      recordTimerRef.current = setInterval(() => setRecordSec(s => s + 1), 1000);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      setIsRecording(false);
    }
  }, [recorder]);

  const finishVoiceRecording = useCallback(async (send: boolean) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setIsRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (send && uri && recordSec >= 1) {
        sendVoiceDM.mutate({ uri, durationSec: recordSec, replyToId: replyingTo?.id });
        setReplyingTo(null);
      } else if (send) {
        // sub-second tap — treat as accidental
      }
    } catch {
      // recording failed — nothing to send
    }
    setRecordSec(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, recordSec, replyingTo]);

  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }, []);

  const listRef = useRef<FlatList<any>>(null);
  const inputRef = useRef<RNTextInput>(null);
  const searchInputRef = useRef<RNTextInput>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remote = isSupabaseRemote();
  const myId = userId ?? 'me';
  usePresenceTracking(remote ? (userId ?? undefined) : undefined);

  // Conversation resolution
  const localConversation = conversations.find(c => c.id === id);
  const { data: remoteConvData, isLoading: convLoading } = useRemoteConversation(
    remote && !localConversation ? id : undefined,
  );

  const conversation = useMemo<ChatConversation | null>(() => localConversation ?? (remoteConvData
    ? {
        id: remoteConvData.id,
        userId: remoteConvData.otherUserId ?? remoteConvData.id,
        username: remoteConvData.isGroup ? 'group' : remoteConvData.otherUsername,
        displayName: remoteConvData.otherDisplayName,
        avatarColor: remoteConvData.otherAvatarColor,
        avatarUrl: remoteConvData.otherAvatarUrl ?? undefined,
        isGroup: remoteConvData.isGroup,
        memberCount: remoteConvData.memberCount,
        isVerified: false,
        lastMessage: remoteConvData.lastMessage ?? '',
        lastMessageAt: remoteConvData.lastMessageAt ?? new Date().toISOString(),
        unreadCount: 0,
      }
    : null), [localConversation, remoteConvData]);

  const pinnedMessage = remoteConvData?.pinnedMessage ?? null;

  // Remote hooks
  const { data: remoteMessagePages, fetchNextPage, hasNextPage } = useRemoteMessages(remote ? id : undefined);
  const remoteMessages = (remoteMessagePages?.pages ?? []).flat();
  const isGroupConversation = !!conversation?.isGroup;
  const sendRemote = useSendRemoteDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const sendImageDM = useSendImageDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const sendVoiceDM = useSendVoiceDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const sendLinkDM = useSendLinkDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const sendContactDM = useSendContactDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const sendEchoDM = useSendEchoDM(id, conversation?.userId ?? undefined, isGroupConversation);
  const editMessage = useEditMessage(id);
  const pinMessage = usePinMessage(id);
  const { mutate: doMarkRead } = useMarkRead();
  const deleteMessage = useDeleteMessage(id);
  const toggleReaction = useToggleReaction(id);
  const forwardMessage = useForwardMessage();
  const discardLocal = useDiscardLocalMessage(id);
  const [forwardTarget, setForwardTarget] = useState<NormalizedMessage | null>(null);
  const { partnerIsTyping, sendTypingEvent } = useTypingIndicator(
    remote ? id : undefined,
    remote ? myId : undefined,
  );

  // Message normalization
  const localMessages = (id ? getDMs(id) : []) as DirectMessage[];

  const messages: NormalizedMessage[] = remote
    ? remoteMessages.map(m => {
        const payload = tryParsePayload(m.content);
        const contact = payload?.type === 'contact' ? payload : null;
        const url = (payload?.url as string | undefined) ?? (m.kind === 'link' && !contact ? firstUrl(m.content ?? '') : null);
        return {
          id: m.id,
          senderId: m.senderId,
          content: payload ? null : m.content,
          createdAt: m.createdAt,
          isRead: !!m.readAt,
          deletedAt: m.deletedAt,
          editedAt: m.editedAt,
          kind: contact ? 'contact' : m.kind,
          sharedEchoId: m.sharedEchoId,
          sharedEchoTitle: m.kind === 'echo'
            ? ((payload?.title as string | undefined) ?? (m.content ?? 'Shared Echo'))
            : null,
          sharedEchoPreview: m.kind === 'echo' ? ((payload?.preview as string | undefined) ?? null) : null,
          sharedEchoAuthor: m.kind === 'echo' ? ((payload?.author as string | undefined) ?? null) : null,
          mediaUrl: m.mediaUrl,
          linkUrl: url,
          linkTitle: (payload?.title as string | undefined) ?? (url ? urlHost(url) : null),
          linkSubtitle: (payload?.subtitle as string | undefined) ?? null,
          contactUserId: contact ? ((contact.userId as string | undefined) ?? null) : null,
          contactUsername: contact ? ((contact.username as string | undefined) ?? null) : null,
          contactDisplayName: contact ? ((contact.displayName as string | undefined) ?? null) : null,
          contactAvatarColor: contact ? ((contact.avatarColor as string | undefined) ?? null) : null,
          replyToId: m.replyToId,
          replyToContent: m.replyToContent,
          replyToSenderId: m.replyToSenderId,
          replyToKind: m.replyToKind,
          replyToDeleted: m.replyToDeleted,
          reactions: m.reactions,
        };
      })
    : localMessages.map(m => {
        const url = m.linkUrl ?? (m.kind === 'link' ? firstUrl(m.content) : null);
        return {
          id: m.id,
          senderId: m.senderId,
          content: m.kind === 'image' || m.kind === 'link' || m.kind === 'contact' ? null : m.content,
          createdAt: m.createdAt,
          isRead: m.isRead,
          deletedAt: null,
          editedAt: null,
          kind: m.kind ?? (m.sharedEchoTitle ? 'echo' : 'text'),
          sharedEchoId: m.sharedEchoId ?? null,
          sharedEchoTitle: m.sharedEchoTitle ?? null,
          sharedEchoPreview: m.sharedEchoPreview ?? null,
          sharedEchoAuthor: m.sharedEchoAuthor ?? null,
          mediaUrl: m.mediaUrl ?? null,
          linkUrl: url,
          linkTitle: m.linkTitle ?? (url ? urlHost(url) : null),
          linkSubtitle: m.linkSubtitle ?? null,
          contactUserId: m.contactUserId ?? null,
          contactUsername: m.contactUsername ?? null,
          contactDisplayName: m.contactDisplayName ?? null,
          contactAvatarColor: m.contactAvatarColor ?? null,
          replyToId: null,
          replyToContent: null,
          replyToSenderId: null,
          replyToKind: null,
          replyToDeleted: false,
          reactions: [],
        };
      });

  const online = conversation && !conversation.isGroup && conversation.userId ? isUserOnline(conversation.userId) : false;
  const searchTerm = searchQuery.trim().toLowerCase();
  const visibleMessages = searchTerm
    ? messages.filter(message => messageSearchText(message).includes(searchTerm))
    : messages;
  const searchMatchCount = searchTerm ? visibleMessages.length : 0;

  // Snapshot where the unread block starts, once, before mark-read wipes the
  // flags — this anchors the "New messages" divider for the whole visit.
  const firstUnreadIdRef = useRef<string | null>(null);
  const unreadSnapshotTaken = useRef(false);
  useEffect(() => {
    if (unreadSnapshotTaken.current || messages.length === 0) return;
    unreadSnapshotTaken.current = true;
    const firstUnread = messages.find(m => !m.isRead && m.senderId !== myId && !m.deletedAt);
    firstUnreadIdRef.current = firstUnread?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Effects
  useEffect(() => {
    if (id) markConversationRead(id);
  }, [id, markConversationRead]);

  const markedReadRef = useRef(false);
  useEffect(() => {
    if (!remote || !id || markedReadRef.current) return;
    markedReadRef.current = true;
    void markMessagesRead(id).then(() => doMarkRead(id));
  }, [remote, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Echo sharing
  useEffect(() => {
    if (!id || !echoId || !echoTitle || !sharedPending || !conversation) return;
    if (!remote) {
      shareEchoInDM(id, {
        id: String(echoId),
        userId: conversation.userId,
        username: conversation.username,
        displayName: conversation.displayName,
        avatarColor: conversation.avatarColor,
        isVerified: !!conversation.isVerified,
        prompt: String(echoTitle),
        response: String(echoPreview ?? ''),
        likes: 0, isLiked: false, isBookmarked: false, isReposted: false,
        repostCount: 0, commentCount: 0, viewCount: 0, hashtags: [],
        createdAt: new Date().toISOString(),
        editorialTitle: String(echoTitle),
        authorNote: String(echoPreview ?? ''),
      }, `Thought you'd like this Echo from ${echoAuthor ?? conversation.displayName}.`);
      setSharedPending(false);
      return;
    }
    sendEchoDM.mutate({
      echo: {
        id: String(echoId),
        title: String(echoTitle),
        preview: echoPreview ? String(echoPreview) : undefined,
        author: echoAuthor ? String(echoAuthor) : undefined,
      },
      intro: `Thought you'd like this Echo from ${echoAuthor ?? conversation.displayName}.`,
    }, {
      onError: () => Alert.alert('Error', 'Failed to share Echo. Please try again.'),
    });
    setSharedPending(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedPending, echoId, remote, conversation?.id]);

  useEffect(() => {
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [searchOpen]);

  // Handlers
  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !id) return;
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setText('');
    setQuickAction(null);

    if (editingMessage) {
      if (remote) editMessage.mutate(
        { messageId: editingMessage.id, content },
        { onError: () => Alert.alert('Error', 'Failed to edit message. Please try again.') },
      );
      setEditingMessage(null);
      return;
    }

    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    const link = firstUrl(content);

    if (link && content === link) {
      const title = urlHost(link);
      if (remote) {
        sendLinkDM.mutate({ url: link, title, replyToId }, {
          onError: () => {
            setText(content);
            Alert.alert('Error', 'Link failed to send. Please try again.');
          },
        });
      } else {
        sendLocalLink(id, link, title);
      }
    } else if (remote) {
      sendRemote.mutate({ content, replyToId }, {
        onError: () => {
          setText(content);
          Alert.alert('Error', 'Message failed to send. Please try again.');
        },
      });
    } else {
      sendDM(id, content);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [text, id, hapticEnabled, remote, sendRemote, sendDM, editingMessage, editMessage, replyingTo, sendLinkDM, sendLocalLink]);

  const sendPickedImage = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setAttachmentMenuOpen(false);
    setImageUploading(true);
    try {
      if (remote) {
        sendImageDM.mutate({
          uri: asset.uri,
          mimeType: asset.mimeType ?? 'image/jpeg',
          replyToId: replyingTo?.id,
        }, {
          onSettled: () => {
            setImageUploading(false);
            setReplyingTo(null);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          },
          onError: error => Alert.alert(
            'Image failed',
            error instanceof Error ? error.message : 'Failed to send image. Please try again.',
          ),
        });
      } else if (id) {
        sendLocalImage(id, asset.uri);
        setImageUploading(false);
        setReplyingTo(null);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    } catch {
      setImageUploading(false);
    }
  }, [sendImageDM, replyingTo, remote, id, sendLocalImage]);

  const handlePickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    sendPickedImage(result.assets[0]);
  }, [sendPickedImage]);

  const handleTakePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take and send photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.78,
    });
    if (result.canceled || !result.assets[0]) return;
    sendPickedImage(result.assets[0]);
  }, [sendPickedImage]);

  const handleShareContact = useCallback(() => {
    if (!id || !conversation || conversation.isGroup || !conversation.userId) return;
    setAttachmentMenuOpen(false);
    const contact = {
      userId: conversation.userId,
      username: conversation.username,
      displayName: conversation.displayName,
      avatarColor: conversation.avatarColor,
    };
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    if (remote) {
      sendContactDM.mutate({ contact, replyToId }, {
        onError: () => Alert.alert('Error', 'Contact failed to send. Please try again.'),
      });
    } else {
      shareContactInDM(id, conversation);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [id, conversation, replyingTo, remote, sendContactDM, shareContactInDM]);

  const handleSendLinkFromComposer = useCallback(() => {
    const link = firstUrl(text.trim());
    if (!id || !link) {
      Alert.alert('Paste a link first', 'Paste a URL in the message box, then tap Link.');
      return;
    }
    setAttachmentMenuOpen(false);
    setText('');
    setQuickAction(null);
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    const title = urlHost(link);
    if (remote) {
      sendLinkDM.mutate({ url: link, title, replyToId }, {
        onError: () => {
          setText(link);
          Alert.alert('Error', 'Link failed to send. Please try again.');
        },
      });
    } else {
      sendLocalLink(id, link, title, userUrl(conversation?.username ?? ''));
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [text, id, replyingTo, remote, sendLinkDM, sendLocalLink, conversation?.username]);

  const handleLongPress = useCallback((message: NormalizedMessage) => {
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveMessage(message);
    setActionSheetVisible(true);
  }, [hapticEnabled]);

  const handleCopy = useCallback(() => {
    if (activeMessage?.content) {
      void import('react-native').then(({ Share }) => Share.share({ message: activeMessage.content! }));
    }
  }, [activeMessage]);

  const handleDelete = useCallback(() => {
    if (!activeMessage || !remote) return;
    deleteMessage.mutate(activeMessage.id);
  }, [activeMessage, remote, deleteMessage]);

  const handleReact = useCallback((reactionValue: string, hasReacted: boolean) => {
    if (!activeMessage || !remote) return;
    toggleReaction.mutate({ messageId: activeMessage.id, reactionValue, hasReacted });
  }, [activeMessage, remote, toggleReaction]);

  const handleReply = useCallback(() => {
    if (!activeMessage) return;
    setReplyingTo(activeMessage);
    setEditingMessage(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [activeMessage]);

  const handleEdit = useCallback(() => {
    if (!activeMessage || activeMessage.kind !== 'text' || !activeMessage.content) return;
    setEditingMessage(activeMessage);
    setReplyingTo(null);
    setText(activeMessage.content);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [activeMessage]);

  const handlePin = useCallback(() => {
    if (!activeMessage || !remote) return;
    const isCurrentlyPinned = pinnedMessage?.id === activeMessage.id;
    pinMessage.mutate({ messageId: isCurrentlyPinned ? null : activeMessage.id });
  }, [activeMessage, remote, pinMessage, pinnedMessage]);

  const handleUnpin = useCallback(() => {
    if (!remote) return;
    pinMessage.mutate({ messageId: null });
  }, [remote, pinMessage]);

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    if (!remote || !t.length) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTypingEvent(), 1500);
  }, [remote, sendTypingEvent]);

  const cancelComposerExtra = useCallback(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setText('');
    setQuickAction(null);
  }, []);

  // Build list data with date separators + the unread divider
  type ListRow =
    | { type: 'message'; msg: NormalizedMessage; grouped: boolean }
    | { type: 'date'; label: string }
    | { type: 'unread' };

  const listData: ListRow[] = [];
  visibleMessages.forEach((msg, i) => {
    const prev = visibleMessages[i - 1];
    if (!prev || !isSameDay(msg.createdAt, prev.createdAt)) {
      listData.push({ type: 'date', label: getDateLabel(msg.createdAt) });
    }
    if (!searchTerm && msg.id === firstUnreadIdRef.current) {
      listData.push({ type: 'unread' });
    }
    listData.push({ type: 'message', msg, grouped: isGroupedWithPrev(msg, prev) });
  });

  // Loading / not found
  if (!conversation) {
    if (remote && convLoading) {
      return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <AnimatedPressable onPress={() => safeBack('/messages')} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
              <ArrowLeft color={colors.text} size={24} />
            </AnimatedPressable>
          </View>
          <FeedCardSkeleton /><FeedCardSkeleton /><FeedCardSkeleton />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Conversation not found</Text>
        <Pressable onPress={() => safeBack('/messages')}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const canSend = editingMessage
    ? text.trim().length > 0 && text.trim() !== editingMessage.content
    : text.trim().length > 0 || imageUploading;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <AnimatedPressable onPress={() => safeBack('/messages')} style={{ padding: 4, marginRight: 10 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>

        <Pressable
          onPress={() => {
            if (conversation.isGroup) router.push(`/group/${id}`);
            else if (conversation.userId) router.push(`/user/${conversation.userId}`);
          }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={conversation.isGroup ? 'Group info' : 'View profile'}
        >
          <View style={{ marginRight: 10 }}>
            <Avatar
              name={conversation.displayName ?? '?'}
              color={conversation.avatarColor}
              url={conversation.isGroup ? undefined : conversation.avatarUrl}
              size={40}
              online={online}
            >
              {conversation.isGroup ? <Users color="#fff" size={17} weight="fill" /> : undefined}
            </Avatar>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
                {conversation.displayName}
              </Text>
              {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            </View>
            <Text style={{ color: online ? colors.success : colors.textMuted, fontSize: 12 }}>
              {conversation.isGroup
                ? `${conversation.memberCount ?? 1} members · tap to manage`
                : online ? 'Online now' : `@${conversation.username}`}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            setSearchOpen(open => {
              const next = !open;
              if (!next) setSearchQuery('');
              return next;
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Close message search' : 'Search messages'}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: searchOpen ? colors.accentMuted : colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: searchOpen ? colors.accent : colors.border,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          {searchOpen
            ? <X color={colors.accent} size={17} weight="bold" />
            : <MagnifyingGlass color={colors.textSecondary} size={17} weight="bold" />
          }
        </Pressable>
      </View>

      {searchOpen && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 42,
            paddingHorizontal: 12,
            borderRadius: radius.card,
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: colors.inputBorder,
          }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <RNTextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search this conversation"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 9 }}
            />
            {searchTerm ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                {searchMatchCount}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      )}

      {/* Pinned message */}
      {pinnedMessage && (
        <PinnedMessageBanner
          content={pinnedMessage.content}
          kind={pinnedMessage.kind}
          onUnpin={handleUnpin}
        />
      )}

      {/* Echo context banner */}
      {echoTitle && !sharedPending ? (
        <Animated.View
          entering={reduceAnimations ? undefined : FadeIn.duration(200)}
          style={{
            paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
            backgroundColor: colors.surface,
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}
        >
          <Sparkle color={colors.accent} size={14} weight="fill" />
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            <Text style={{ fontWeight: '700', color: colors.text }}>Echo: </Text>
            {echoTitle}
          </Text>
        </Animated.View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >

        {/* Message list */}
        <FlatList<ListRow>
          ref={listRef}
          data={listData}
          keyExtractor={(item, i) => item.type === 'date' ? `date-${i}` : item.type === 'unread' ? 'unread-divider' : item.msg.id}
          contentContainerStyle={{ paddingVertical: 10 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (isAtBottom) listRef.current?.scrollToEnd({ animated: false });
          }}
          onEndReached={() => { if (hasNextPage) void fetchNextPage(); }}
          onEndReachedThreshold={0.25}
          onScroll={e => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
            setIsAtBottom(distFromBottom < 80);
          }}
          scrollEventThrottle={100}
          ListFooterComponent={partnerIsTyping ? <TypingDots /> : null}
          ListEmptyComponent={searchTerm ? (
            <View style={{ alignItems: 'center', paddingVertical: 42, paddingHorizontal: 24 }}>
              <MagnifyingGlass color={colors.textMuted} size={28} />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 12 }}>
                No messages found
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 5 }}>
                Try a different word, link, contact, or photo search.
              </Text>
            </View>
          ) : null}
          renderItem={({ item }) => {
            if (item.type === 'date') return <DateSeparator label={item.label} />;
            if (item.type === 'unread') return <UnreadDivider />;
            const { msg, grouped } = item;
            return (
              <DMBubble
                message={msg}
                isMe={remote ? msg.senderId === myId : msg.senderId === 'me'}
                showReadReceipt={readReceipts}
                myUserId={myId}
                grouped={grouped}
                onLongPress={() => handleLongPress(msg)}
                onReactionToggle={(val, hasReacted) => {
                  if (!remote) return;
                  toggleReaction.mutate({ messageId: msg.id, reactionValue: val, hasReacted });
                }}
                onReplyPress={replyId => {
                  // Scroll to the replied message
                  const idx = listData.findIndex(r => r.type === 'message' && r.msg.id === replyId);
                  if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true });
                }}
                onImagePress={setImagePreviewUrl}
                onSwipeReply={remote ? () => { setEditingMessage(null); setReplyingTo(msg); } : undefined}
                onRetry={remote && msg.id.startsWith('failed-') && msg.kind === 'text' && msg.content ? () => {
                  discardLocal(msg.id);
                  sendRemote.mutate({ content: msg.content!, replyToId: msg.replyToId ?? undefined });
                } : undefined}
              />
            );
          }}
        />

        {/* Jump to bottom FAB */}
        {!isAtBottom && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(120)}
            style={{ position: 'absolute', bottom: 80, right: 16, zIndex: 10 }}
          >
            <Pressable
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: colors.accent,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
              }}
            >
              <ArrowFatLinesUp color="#fff" size={16} weight="fill" style={{ transform: [{ rotate: '180deg' }] }} />
            </Pressable>
          </Animated.View>
        )}

        {/* Reply / Edit composer banner */}
        {(replyingTo || editingMessage) && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 14, paddingVertical: 9,
              backgroundColor: colors.surface,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
            }}
          >
            {editingMessage
              ? <PencilSimple color={colors.accent} size={15} weight="fill" />
              : <ArrowBendUpLeft color={colors.accent} size={15} weight="fill" />
            }
            <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
              {editingMessage ? 'Editing message' : (replyingTo?.content?.slice(0, 60) ?? 'Message')}
            </Text>
            <Pressable onPress={cancelComposerExtra} hitSlop={10}>
              <X color={colors.textMuted} size={16} />
            </Pressable>
          </Animated.View>
        )}

        {/* Quick starters */}
        {!composerFocused && !editingMessage && !replyingTo && (
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Object.entries({ followup: 'Follow-up', summary: 'Your take', draft: 'Draft' }).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => { setQuickAction(key); setText(QUICK_STARTERS[key]); }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7,
                    borderRadius: radius.full, flexShrink: 1,
                    backgroundColor: quickAction === key ? colors.accentMuted : colors.surface,
                    borderWidth: 1, borderColor: quickAction === key ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{
                    color: quickAction === key ? colors.accent : colors.textSecondary,
                    fontSize: 12, fontWeight: '600',
                  }} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!editingMessage && attachmentMenuOpen && (
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={{
              paddingHorizontal: 12,
              paddingTop: 8,
            }}
          >
            <View style={{
              flexDirection: 'row',
              gap: 8,
              padding: 8,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}>
              {[
                { key: 'camera', label: 'Camera', icon: <Camera color={colors.accent} size={17} weight="bold" />, onPress: handleTakePhoto },
                { key: 'gallery', label: 'Gallery', icon: <Images color={colors.accent} size={17} weight="bold" />, onPress: handlePickImage },
                ...(!conversation?.isGroup ? [{ key: 'contact', label: 'Contact', icon: <UserCircle color={colors.accent} size={17} weight="bold" />, onPress: handleShareContact }] : []),
                { key: 'link', label: 'Link', icon: <LinkSimple color={colors.accent} size={17} weight="bold" />, onPress: handleSendLinkFromComposer },
              ].map(action => (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 42,
                    borderRadius: radius.card - 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: colors.inputBg,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  {action.icon}
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Input bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: Math.max(8, Platform.OS === 'ios' ? 8 : insets.bottom + 8),
          borderTopWidth: 1, borderTopColor: colors.border,
          gap: 8,
        }}>
          {isRecording ? (
            <>
              {/* Recording strip */}
              <Pressable
                onPress={() => void finishVoiceRecording(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel recording"
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.surface,
                  borderWidth: 1, borderColor: colors.border,
                }}
              >
                <X color={colors.textSecondary} size={18} />
              </Pressable>
              <View style={{
                flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 14,
                backgroundColor: colors.inputBg,
                borderWidth: 1, borderColor: '#EF4444AA',
                borderRadius: radius.card,
              }}>
                <Animated.View entering={FadeIn.duration(200)}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />
                </Animated.View>
                <Text style={{ color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600' }}>
                  {Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  Recording voice message…
                </Text>
              </View>
              <AnimatedPressable
                onPress={() => void finishVoiceRecording(true)}
                scaleValue={0.9}
                haptic="medium"
                style={{
                  width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.accent,
                }}
              >
                <PaperPlaneTilt color="#fff" size={18} weight="fill" />
              </AnimatedPressable>
            </>
          ) : (
            <>
              {/* Image picker */}
              {!editingMessage && (
                <Pressable
                  onPress={() => setAttachmentMenuOpen(open => !open)}
                  disabled={imageUploading}
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  {imageUploading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Plus color={colors.textSecondary} size={19} weight={attachmentMenuOpen ? 'fill' : 'regular'} />
                  }
                </Pressable>
              )}

              <View style={{
                flex: 1, minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 14, paddingVertical: 8,
                backgroundColor: colors.inputBg,
                borderWidth: 1, borderColor: editingMessage ? colors.accent : colors.inputBorder,
                borderRadius: radius.card,
              }}>
                <RNTextInput
                  ref={inputRef}
                  style={{ color: colors.text, fontSize: 16, lineHeight: 22, maxHeight: 120 }}
                  placeholder={editingMessage ? 'Edit message…' : 'Message…'}
                  placeholderTextColor={colors.textMuted}
                  value={text}
                  onChangeText={handleTextChange}
                  onFocus={() => setComposerFocused(true)}
                  onBlur={() => setComposerFocused(false)}
                  multiline
                  maxLength={2000}
                />
              </View>

              {/* Empty composer in a remote thread → mic (voice note); else send */}
              {!canSend && remote && !editingMessage ? (
                <AnimatedPressable
                  onPress={() => void startVoiceRecording()}
                  scaleValue={0.9}
                  haptic="medium"
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.surfaceHover,
                  }}
                  accessibilityLabel="Record voice message"
                >
                  <Microphone color={colors.textSecondary} size={19} weight="fill" />
                </AnimatedPressable>
              ) : (
                <AnimatedPressable
                  onPress={handleSend}
                  disabled={!canSend}
                  scaleValue={0.9}
                  haptic="medium"
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: canSend ? (editingMessage ? colors.success ?? colors.accent : colors.accent) : colors.surfaceHover,
                  }}
                >
                  {editingMessage
                    ? <PencilSimple color="#fff" size={18} weight="fill" />
                    : <PaperPlaneTilt color="#fff" size={18} weight="fill" />
                  }
                </AnimatedPressable>
              )}
            </>
          )}
        </View>

      </KeyboardAvoidingView>

      <Modal
        visible={!!imagePreviewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}>
              <Pressable
                onPress={() => setImagePreviewUrl(null)}
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <X color="#fff" size={20} weight="bold" />
              </Pressable>
            </View>
            {imagePreviewUrl ? (
              <Image
                source={{ uri: imagePreviewUrl }}
                style={{ flex: 1, width: '100%' }}
                contentFit="contain"
                transition={120}
              />
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Message action sheet */}
      <MessageActionSheet
        visible={actionSheetVisible}
        message={activeMessage}
        isOwn={remote ? activeMessage?.senderId === myId : activeMessage?.senderId === 'me'}
        myUserId={myId}
        isPinned={pinnedMessage?.id === activeMessage?.id}
        onClose={() => setActionSheetVisible(false)}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onReact={handleReact}
        onReply={handleReply}
        onEdit={handleEdit}
        onPin={handlePin}
        onForward={() => { if (activeMessage) setForwardTarget(activeMessage); }}
      />

      <ForwardSheet
        visible={!!forwardTarget}
        currentConversationId={id}
        onClose={() => setForwardTarget(null)}
        onSelect={(recipientId, displayName) => {
          if (!forwardTarget) return;
          forwardMessage.mutate(
            { messageId: forwardTarget.id, recipientId },
            {
              onSuccess: () => showToast(`Forwarded to ${displayName}`, 'CheckCircle'),
              onError: e => showToast(e instanceof Error ? e.message : 'Forward failed', 'Error'),
            },
          );
        }}
      />
    </SafeAreaView>
  );
}
