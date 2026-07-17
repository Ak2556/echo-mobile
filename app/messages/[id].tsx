import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, FlatList, ScrollView,
  TextInput as RNTextInput, Pressable, StyleSheet, Modal,
  ActivityIndicator, Alert, Linking, Dimensions,
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
  Microphone, Play, Pause, ShareFat, WarningCircle, Users, Heart, Translate, BookmarkSimple,
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
  FadeIn, FadeInUp, FadeOut, SlideInDown, SlideOutDown, ZoomIn, LinearTransition,
  runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  withRepeat, withSequence, withDelay,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { showToast } from '../../components/ui/Toast';
import { streamEchoAI } from '../../lib/api';
import { EMOJI_CATEGORIES, searchEmoji } from '../../lib/emojiData';
import { persistGet, persistSet } from '../../store/persist';
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
import { markMessagesRead, fetchGroupMembers, type GroupMember } from '../../lib/supabaseEchoApi';
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

interface SavedMessage {
  id: string;
  content: string;
  conversationId: string;
  fromName: string;
  savedAt: string;
}


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

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Conversation streak (Snapchat-style): consecutive days where BOTH people sent
 * at least one message, anchored to today (or yesterday, so it survives until
 * you reply). A gentle daily reason to come back. Computed from loaded history,
 * so very long streaks past the first page are an approximation — fine for a
 * momentum signal.
 */
function conversationStreak(messages: NormalizedMessage[], myId: string): number {
  if (messages.length < 2) return 0;
  const days = new Map<string, { me: boolean; them: boolean }>();
  for (const m of messages) {
    if (m.deletedAt) continue;
    const key = localDayKey(new Date(m.createdAt));
    const e = days.get(key) ?? { me: false, them: false };
    if (m.senderId === myId) e.me = true; else e.them = true;
    days.set(key, e);
  }
  const isMutual = (d: Date) => {
    const e = days.get(localDayKey(d));
    return !!e && e.me && e.them;
  };
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (!isMutual(today) && !isMutual(yesterday)) return 0;
  const cursor = new Date(today);
  if (!isMutual(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < 730 && isMutual(cursor); i++) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
        <Animated.View key={val} entering={ZoomIn.springify().damping(13).stiffness(240).mass(0.5)} layout={LinearTransition.springify()}>
          <Pressable
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
        </Animated.View>
      ))}
    </View>
  );
}

// ─── TypingDots ───────────────────────────────────────────────────────────────

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const v = useSharedValue(0.35);
  React.useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 360 }),
      withTiming(0.35, { duration: 360 }),
    ), -1, false));
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.75 + v.value * 0.45 }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]} />;
}

function TypingDots() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: 'flex-start' }}>
      <View style={{
        flexDirection: 'row', gap: 5, alignItems: 'center',
        paddingHorizontal: 15, paddingVertical: 13,
        // Match the received-bubble shape (tail on the bottom-left).
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderBottomLeftRadius: 7, borderBottomRightRadius: 20,
        backgroundColor: colors.surfaceHover,
      }}>
        <TypingDot delay={0} color={colors.textMuted} />
        <TypingDot delay={160} color={colors.textMuted} />
        <TypingDot delay={320} color={colors.textMuted} />
      </View>
    </Animated.View>
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

// ─── Rich text + emoji jumbo ─────────────────────────────────────────────────

/** How many emoji, and whether the message is nothing but emoji (→ jumbo). */
function emojiInfo(text: string): { only: boolean; count: number } {
  const trimmed = text.trim();
  const matches = trimmed.match(/\p{Extended_Pictographic}/gu);
  const count = matches?.length ?? 0;
  if (count === 0) return { only: false, count: 0 };
  const stripped = trimmed.replace(/\p{Extended_Pictographic}/gu, '').replace(/[️‍\s]/gu, '');
  return { only: stripped.length === 0, count };
}

type InlineSpan = { type: 'text' | 'bold' | 'italic' | 'strike' | 'code' | 'mention'; text: string };

/** Non-nested inline markdown + @mentions: **bold** *italic* ~~strike~~ `code` @user. */
function parseInline(text: string): InlineSpan[] {
  const parts: InlineSpan[] = [];
  const re = /(\*\*.+?\*\*|__.+?__|~~.+?~~|`.+?`|\*.+?\*|_.+?_|@[a-zA-Z0-9_]{2,})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('@')) parts.push({ type: 'mention', text: tok });
    else if (tok.startsWith('**') || tok.startsWith('__')) parts.push({ type: 'bold', text: tok.slice(2, -2) });
    else if (tok.startsWith('~~')) parts.push({ type: 'strike', text: tok.slice(2, -2) });
    else if (tok.startsWith('`')) parts.push({ type: 'code', text: tok.slice(1, -1) });
    else parts.push({ type: 'italic', text: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

function FormattedText({ content, color, size }: { content: string; color: string; size: number }) {
  const { colors } = useTheme();
  const parts = useMemo(() => parseInline(content), [content]);
  if (parts.length === 1 && parts[0].type === 'text') {
    return <Text style={{ color, fontSize: size, lineHeight: size * 1.38 }}>{content}</Text>;
  }
  return (
    <Text style={{ color, fontSize: size, lineHeight: size * 1.38 }}>
      {parts.map((p, i) => {
        if (p.type === 'bold') return <Text key={i} style={{ fontWeight: '800' }}>{p.text}</Text>;
        if (p.type === 'italic') return <Text key={i} style={{ fontStyle: 'italic' }}>{p.text}</Text>;
        if (p.type === 'strike') return <Text key={i} style={{ textDecorationLine: 'line-through' }}>{p.text}</Text>;
        if (p.type === 'code') return (
          <Text key={i} style={{ fontFamily: 'monospace', fontSize: size - 1, color: colors.accent, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>{` ${p.text} `}</Text>
        );
        if (p.type === 'mention') return <Text key={i} style={{ color: colors.accent, fontWeight: '700' }}>{p.text}</Text>;
        return <Text key={i}>{p.text}</Text>;
      })}
    </Text>
  );
}

// ─── Send effects ────────────────────────────────────────────────────────────

type EffectKind = 'confetti' | 'hearts';

/** Trigger words → a full-screen celebration, like iMessage screen effects. */
function detectEffect(text: string): EffectKind | null {
  const t = text.toLowerCase();
  if (/congrat|🎉|🎊|🥳|🎂|happy birthday|woohoo|let'?s go|nailed it|you did it/.test(t)) return 'confetti';
  if (/\bi love you\b|love you|love it|love this|😍|🥰|❤️|💕|💖|💗/.test(t)) return 'hearts';
  return null;
}

function EffectParticle({ x, emoji, delay, size, drift, kind }: { x: number; emoji: string; delay: number; size: number; drift: number; kind: EffectKind }) {
  const { height } = Dimensions.get('window');
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 2200 }));
  }, [delay, progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const startY = kind === 'confetti' ? -50 : height + 50;
    const endY = kind === 'confetti' ? height + 50 : -60;
    return {
      transform: [
        { translateX: x + drift * p },
        { translateY: startY + (endY - startY) * p },
        { rotate: `${p * 360 * (kind === 'confetti' ? 1 : 0.25)}deg` },
      ],
      opacity: kind === 'hearts' ? 1 - p * 0.85 : (p < 0.85 ? 1 : Math.max(0, (1 - p) / 0.15)),
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      <Text style={{ fontSize: size }}>{emoji}</Text>
    </Animated.View>
  );
}

function MessageEffect({ kind, onDone }: { kind: EffectKind; onDone: () => void }) {
  const { width } = Dimensions.get('window');
  const set = kind === 'confetti' ? ['🎉', '🎊', '✨', '🎈', '⭐'] : ['❤️', '💕', '💖', '💗', '🥰'];
  const particles = useMemo(
    () => Array.from({ length: 22 }).map((_, i) => ({
      id: i,
      x: Math.random() * width,
      emoji: set[i % set.length],
      delay: Math.random() * 500,
      size: 20 + Math.random() * 18,
      drift: (Math.random() - 0.5) * 90,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  React.useEffect(() => {
    const t = setTimeout(onDone, 2700);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <Animated.View pointerEvents="none" exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill}>
      {particles.map(p => <EffectParticle key={p.id} {...p} kind={kind} />)}
    </Animated.View>
  );
}

// ─── DMBubble ────────────────────────────────────────────────────────────────

function DMBubble({
  message, isMe, showReadReceipt, myUserId, grouped, animate, translation, translating, saved,
  onLongPress, onReactionToggle, onReplyPress, onImagePress, onSwipeReply, onRetry,
}: {
  message: NormalizedMessage;
  isMe: boolean;
  showReadReceipt: boolean;
  myUserId: string;
  grouped: boolean;
  animate?: boolean;
  translation?: string;
  translating?: boolean;
  saved?: boolean;
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

  // Double-tap a text bubble to toss a ❤️ — the beloved iMessage/IG gesture.
  // Scoped to text so it never fights the single-tap on media/link/echo cards.
  const isTextBubble = !!message.content && !['image', 'voice', 'echo', 'link', 'contact'].includes(message.kind);
  const hasHeart = message.reactions.some(r => r.value === '❤️' && r.userId === myUserId);
  const heartPop = useSharedValue(0);
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .enabled(isTextBubble && !isDeleted && !isFailed)
    .onStart(() => {
      heartPop.value = withSpring(1, { damping: 10, stiffness: 260 }, () => {
        heartPop.value = withTiming(0, { duration: 320 });
      });
      runOnJS(onReactionToggle)('❤️', hasHeart);
    });
  const bubbleGesture = Gesture.Simultaneous(swipePan, doubleTap);
  const heartPopStyle = useAnimatedStyle(() => ({
    opacity: heartPop.value,
    transform: [{ scale: 0.6 + heartPop.value * 0.9 }],
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
      const emoji = emojiInfo(message.content);
      // Emoji-only messages go jumbo with no bubble, like iMessage.
      const jumbo = emoji.only && emoji.count <= 6 && !message.replyToId;
      if (jumbo) {
        return (
          <Pressable onLongPress={onLongPress} delayLongPress={350} style={{ paddingVertical: 2, paddingHorizontal: 2 }}>
            <Text style={{ fontSize: emoji.count <= 2 ? 46 : emoji.count <= 4 ? 36 : 30, lineHeight: emoji.count <= 2 ? 56 : 44 }}>
              {message.content}
            </Text>
          </Pressable>
        );
      }
      return (
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
          <View style={{
            paddingHorizontal: 15, paddingVertical: 10,
            // Asymmetric corners give a speech-bubble tail toward the sender's
            // side, so even a one-word message reads as a bubble, not a circle.
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderBottomLeftRadius: isMe ? 20 : 7,
            borderBottomRightRadius: isMe ? 7 : 20,
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
            <FormattedText content={message.content} color={textColor} size={textSize} />
          </View>
        </Pressable>
      );
    }

    return null;
  };

  return (
    <Animated.View
      entering={animate ? FadeInUp.springify().damping(19).stiffness(190).mass(0.55) : undefined}
      style={{ paddingHorizontal: 16, paddingVertical: grouped ? 1 : 4, alignItems: isMe ? 'flex-end' : 'flex-start' }}
    >
      <GestureDetector gesture={bubbleGesture}>
        <Animated.View style={[{ maxWidth: '82%' }, swipeStyle]}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -6, alignSelf: 'center', zIndex: 5 }, heartPopStyle]}>
            <Heart color="#F0506E" size={38} weight="fill" />
          </Animated.View>
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

          {(translation || translating) && (
            <Animated.View
              entering={FadeIn.duration(160)}
              style={{
                marginTop: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
                backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.accent}40`,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Translate color={colors.accent} size={12} weight="bold" />
                <Text style={{ color: colors.accent, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 }}>TRANSLATION</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: textSize - 1, lineHeight: (textSize - 1) * 1.35 }}>
                {translation || 'Translating…'}
              </Text>
            </Animated.View>
          )}

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
            <WarningCircle color={colors.danger} size={12} weight="fill" />
            <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>Failed to send — tap to retry</Text>
          </View>
        </Pressable>
      ) : !grouped && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, marginHorizontal: 2 }}>
          {saved && <BookmarkSimple color={colors.accent} size={11} weight="fill" />}
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
    </Animated.View>
  );
}

// ─── UnreadDivider ───────────────────────────────────────────────────────────

function UnreadDivider({ count, loading, onCatchUp }: { count?: number; loading?: boolean; onCatchUp?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accent + '66' }} />
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>NEW MESSAGES</Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accent + '66' }} />
      </View>
      {onCatchUp && (count ?? 0) >= 3 && (
        <View style={{ alignItems: 'center' }}>
          <AnimatedPressable
            onPress={onCatchUp}
            disabled={loading}
            haptic="light"
            scaleValue={0.96}
            accessibilityRole="button"
            accessibilityLabel="Catch me up on unread messages"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: colors.accentMuted,
              borderWidth: 1, borderColor: `${colors.accent}55`,
            }}
          >
            {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Sparkle color={colors.accent} size={13} weight="fill" />}
            <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '800' }}>
              Catch me up on {count} message{count === 1 ? '' : 's'}
            </Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
}

// ─── StickerSheet ────────────────────────────────────────────────────────────

const EMOJI_RECENTS_KEY = 'chat:emojiRecents';

function StickerSheet({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (sticker: string) => void;
  onClose: () => void;
}) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('recents');
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  React.useEffect(() => {
    if (visible) {
      const r = persistGet<string[]>(EMOJI_RECENTS_KEY, []);
      setRecents(Array.isArray(r) ? r : []);
      setCategory(r.length ? 'recents' : EMOJI_CATEGORIES[0].id);
      setQuery('');
    }
  }, [visible]);

  const pick = (emoji: string) => {
    const next = [emoji, ...recents.filter(e => e !== emoji)].slice(0, 32);
    setRecents(next);
    persistSet(EMOJI_RECENTS_KEY, next);
    onSelect(emoji);
    onClose();
  };

  const q = query.trim();
  const data: string[] = q
    ? searchEmoji(q)
    : category === 'recents'
      ? recents
      : (EMOJI_CATEGORIES.find(c => c.id === category)?.emojis ?? []);

  const tabs = [{ id: 'recents', icon: '🕐' }, ...EMOJI_CATEGORIES.map(c => ({ id: c.id, icon: c.icon }))];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={reduceAnimations ? undefined : FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
        exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      >
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingBottom: insets.bottom + 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 10 }}>
            <Sparkle color={colors.accent} size={16} weight="fill" />
            <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Fraunces_600SemiBold', marginLeft: 7, flex: 1 }}>Emoji & Stickers</Text>
            <Pressable onPress={onClose} hitSlop={10}><X color={colors.textMuted} size={20} /></Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.inputBorder }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <RNTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search emoji"
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 15 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={8}><X color={colors.textMuted} size={15} /></Pressable>}
          </View>

          <FlatList
            data={data}
            key={q ? 'search' : category}
            keyExtractor={(item, i) => `${item}-${i}`}
            numColumns={7}
            style={{ height: 250 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  {q ? 'No emoji found' : 'Your recent emoji show up here'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item)}
                accessibilityRole="button"
                accessibilityLabel={`Send ${item}`}
                style={({ pressed }) => ({ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1, transform: [{ scale: pressed ? 0.82 : 1 }] })}
              >
                <Text style={{ fontSize: 30 }}>{item}</Text>
              </Pressable>
            )}
          />

          {!q && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 2, alignItems: 'center' }} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8 }}>
              {tabs.map(t => (
                <Pressable key={t.id} onPress={() => setCategory(t.id)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11, backgroundColor: category === t.id ? colors.accentMuted : 'transparent' }}>
                  <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </Animated.View>
    </Modal>
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
  onClose, onCopy, onDelete, onReact, onReply, onEdit, onPin, onForward, onTranslate, onSmartReply, onSave, isSaved,
}: {
  visible: boolean;
  message: NormalizedMessage | null;
  isOwn: boolean;
  myUserId: string;
  isPinned: boolean;
  isSaved: boolean;
  onSave: () => void;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReact: (val: string, hasReacted: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onForward: () => void;
  onTranslate: () => void;
  onSmartReply: () => void;
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
        style={{ flex: 1, color: destructive ? colors.danger : colors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' }}
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

        {/* Ask Echo — AI actions */}
        {isText && (
          <View style={{
            borderRadius: 18, overflow: 'hidden', marginBottom: 8,
            borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.accent}44`,
            backgroundColor: colors.surface,
          }}>
            {!isOwn && (
              <Row icon={<Sparkle color={colors.accent} size={18} weight="fill" />} label="Reply with Echo" onPress={onSmartReply} bordered={false} />
            )}
            <Row icon={<Translate color={colors.accent} size={18} weight="bold" />} label="Translate" onPress={onTranslate} bordered={!isOwn} />
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
          {isText && (
            <Row
              icon={<BookmarkSimple color={colors.text} size={18} weight={isSaved ? 'fill' : 'regular'} />}
              label={isSaved ? 'Unsave' : 'Save message'}
              onPress={onSave}
            />
          )}
          {!isDeleted && (
            <Row
              icon={<PushPin color={colors.text} size={18} weight={isPinned ? 'fill' : 'regular'} />}
              label={isPinned ? 'Unpin' : 'Pin'}
              onPress={onPin}
            />
          )}
          {isOwn && !isDeleted && (
            <Row icon={<Trash color={colors.danger} size={18} />} label="Delete" destructive onPress={onDelete} />
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
  const [replyLoading, setReplyLoading] = useState<string | null>(null);
  const [polishing, setPolishing] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [catchup, setCatchup] = useState<string | null>(null);
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [effect, setEffect] = useState<EffectKind | null>(null);
  const lastEffectIdRef = useRef<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [activeMessage, setActiveMessage] = useState<NormalizedMessage | null>(null);
  const [savedMsgs, setSavedMsgs] = useState<SavedMessage[]>(() => {
    const v = persistGet<SavedMessage[]>('chat:savedMessages', []);
    return Array.isArray(v) ? v : [];
  });
  const [showSaved, setShowSaved] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<NormalizedMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<NormalizedMessage | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
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
  // Entrance motion: animate a bubble only the first time it renders AND only if
  // it arrived this session — so the initial load and scroll-back never replay.
  const animatedIds = useRef<Set<string>>(new Set());
  const openedAtRef = useRef(Date.now());
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
  const streak = useMemo(
    () => (conversation && !conversation.isGroup ? conversationStreak(messages, myId) : 0),
    [messages, myId, conversation],
  );

  // Play a screen effect when a fresh celebratory message arrives from them.
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest || newest.senderId === myId || newest.deletedAt || !newest.content) return;
    if (lastEffectIdRef.current === newest.id) return;
    lastEffectIdRef.current = newest.id;
    if (new Date(newest.createdAt).getTime() < openedAtRef.current - 2000) return;
    const fx = detectEffect(newest.content);
    if (fx) setEffect(fx);
  }, [messages, myId]);

  // Group members power @mention autocomplete.
  useEffect(() => {
    if (remote && isGroupConversation && id) {
      fetchGroupMembers(id).then(setGroupMembers).catch(() => setGroupMembers([]));
    }
  }, [remote, isGroupConversation, id]);

  const mentionMatch = isGroupConversation ? /(?:^|\s)@(\w*)$/.exec(text) : null;
  const mentionResults = mentionMatch
    ? groupMembers
        .filter(mem => mem.userId !== myId)
        .filter(mem => {
          const q = mentionMatch[1].toLowerCase();
          return !q || mem.username.toLowerCase().includes(q) || mem.displayName.toLowerCase().includes(q);
        })
        .slice(0, 6)
    : [];
  const insertMention = (mem: GroupMember) => {
    setText(t => t.replace(/@\w*$/, `@${mem.username} `));
    inputRef.current?.focus();
  };

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
    // iMessage-style screen effect on celebratory sends.
    const fx = detectEffect(content);
    if (fx) setEffect(fx);
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

  const sendSticker = useCallback((sticker: string) => {
    if (!id) return;
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const fx = detectEffect(sticker);
    if (fx) setEffect(fx);
    if (remote) {
      sendRemote.mutate({ content: sticker }, { onError: () => Alert.alert('Error', 'Failed to send sticker. Please try again.') });
    } else {
      sendDM(id, sticker);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [id, hapticEnabled, remote, sendRemote, sendDM]);

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

  const savedIdSet = useMemo(() => new Set(savedMsgs.filter(s => s.conversationId === id).map(s => s.id)), [savedMsgs, id]);
  const conversationSaved = useMemo(() => savedMsgs.filter(s => s.conversationId === id), [savedMsgs, id]);

  const handleToggleSave = useCallback(() => {
    const m = activeMessage;
    if (!m || !m.content || !id) return;
    setSavedMsgs(prev => {
      const exists = prev.some(s => s.id === m.id);
      const next = exists
        ? prev.filter(s => s.id !== m.id)
        : [{ id: m.id, content: m.content!, conversationId: id, fromName: m.senderId === myId ? 'You' : (conversation?.displayName ?? 'Them'), savedAt: new Date().toISOString() }, ...prev].slice(0, 200);
      persistSet('chat:savedMessages', next);
      return next;
    });
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeMessage, id, myId, conversation, hapticEnabled]);

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

  // Smart replies: read the actual conversation and stream a contextual
  // suggestion into the composer (the "Echo is writing" effect), so the chips
  // feel like magic instead of canned starters. Falls back to a static starter
  // offline. This is Echo's edge — helping you say the right thing in a DM.
  const generateSmartReply = useCallback(async (intent: string) => {
    if (replyLoading) return;
    setQuickAction(intent);
    setReplyLoading(intent);
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const them = conversation?.displayName ?? 'them';
    const recent = messages.filter(m => !m.deletedAt && m.content).slice(-8);
    const transcript = recent
      .map(m => `${m.senderId === myId ? 'Me' : them}: ${m.content}`)
      .join('\n');
    const instruction: Record<string, string> = {
      followup: `Write one short, natural follow-up question that continues this chat. Casual, friendly, no quotes.`,
      summary: `Write a brief reply from "Me" sharing my perspective on the latest message. One or two sentences, casual, no quotes.`,
      draft: `Write a thoughtful, warm reply from "Me" to the latest message. One or two sentences, casual, no quotes.`,
    };
    const task = instruction[intent] ?? instruction.draft;
    const prompt = transcript
      ? `Help me reply in a private chat with ${them}. Recent conversation:\n\n${transcript}\n\n${task} Output only the message text, nothing else.`
      : `Help me open a friendly private chat with ${them}. Write one warm, casual opening message. Output only the message text, nothing else.`;
    let acc = '';
    try {
      await streamEchoAI({
        message: prompt,
        onEvent: e => {
          if (e.type === 'text_delta') { acc += e.delta; setText(acc.replace(/^["']|["']$/g, '').trimStart()); }
        },
      });
      const cleaned = acc.replace(/^["']|["']$/g, '').trim();
      setText(cleaned || (QUICK_STARTERS[intent] ?? ''));
      if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setText(QUICK_STARTERS[intent] ?? '');
      showToast('Couldn’t reach Echo — starter added', 'Offline');
    } finally {
      setReplyLoading(null);
      inputRef.current?.focus();
    }
  }, [replyLoading, conversation, messages, myId, hapticEnabled]);

  // "Catch me up": summarize the unread messages from the other person. The
  // retention superpower — open a busy thread and Echo tells you what you missed.
  const unreadPartnerMsgs = useMemo(() => {
    const firstId = firstUnreadIdRef.current;
    if (!firstId) return [] as NormalizedMessage[];
    const idx = messages.findIndex(m => m.id === firstId);
    if (idx < 0) return [] as NormalizedMessage[];
    return messages.slice(idx).filter(m => m.senderId !== myId && !m.deletedAt && m.content);
  }, [messages, myId]);

  const handleCatchUp = useCallback(async () => {
    if (catchupLoading || unreadPartnerMsgs.length === 0) return;
    setCatchup('');
    setCatchupLoading(true);
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const them = conversation?.displayName ?? 'they';
    const transcript = unreadPartnerMsgs.map(m => `${them}: ${m.content}`).join('\n');
    let acc = '';
    try {
      await streamEchoAI({
        message: `Summarize what ${them} said in these unread messages — 2-4 short bullet points, capturing any questions or things I need to act on. Be concise and friendly.\n\n${transcript}`,
        onEvent: e => { if (e.type === 'text_delta') { acc += e.delta; setCatchup(acc.trimStart()); } },
      });
      setCatchup(acc.trim() || 'Nothing much to catch up on.');
    } catch {
      setCatchup(null);
      showToast('Couldn’t summarize right now', 'Offline');
    } finally {
      setCatchupLoading(false);
    }
  }, [catchupLoading, unreadPartnerMsgs, conversation, hapticEnabled]);

  // Tone/polish: rewrite the current draft in a chosen voice, streamed back into
  // the composer. Echo helps you say it better before you hit send.
  const polishDraft = useCallback(async (tone: string) => {
    const draft = text.trim();
    if (!draft || polishing) return;
    setPolishing(tone);
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const how: Record<string, string> = {
      warmer: 'Make it warmer and friendlier',
      shorter: 'Make it shorter and more concise',
      funnier: 'Make it more playful and lightly funny',
      fix: 'Fix spelling, grammar, and punctuation only',
    };
    const prompt = `Rewrite the following chat message. ${how[tone] ?? how.fix}. Keep my meaning and casual voice. Output only the rewritten message, no quotes or notes:\n\n${draft}`;
    let acc = '';
    try {
      await streamEchoAI({
        message: prompt,
        onEvent: e => { if (e.type === 'text_delta') { acc += e.delta; setText(acc.replace(/^["']|["']$/g, '').trimStart()); } },
      });
      setText(acc.replace(/^["']|["']$/g, '').trim() || draft);
      if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setText(draft);
      showToast('Couldn’t reach Echo', 'Offline');
    } finally {
      setPolishing(null);
    }
  }, [text, polishing, hapticEnabled]);

  // Inline AI translation — tap Translate on a message; the result streams in
  // and renders under the bubble. Tap again to hide.
  const handleTranslate = useCallback(async (msg: NormalizedMessage) => {
    if (!msg.content) return;
    if (translations[msg.id]) {
      setTranslations(prev => { const next = { ...prev }; delete next[msg.id]; return next; });
      return;
    }
    setTranslatingId(msg.id);
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let acc = '';
    try {
      await streamEchoAI({
        message: `Translate the following message to English. If it is already English, translate it to Spanish instead. Output only the translation, no quotes or notes:\n\n${msg.content}`,
        onEvent: e => { if (e.type === 'text_delta') { acc += e.delta; setTranslations(prev => ({ ...prev, [msg.id]: acc.trim() })); } },
      });
      setTranslations(prev => ({ ...prev, [msg.id]: acc.trim() || '—' }));
    } catch {
      showToast('Couldn’t translate right now', 'Offline');
      setTranslations(prev => { const next = { ...prev }; delete next[msg.id]; return next; });
    } finally {
      setTranslatingId(null);
    }
  }, [translations, hapticEnabled]);

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
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                {conversation.displayName}
              </Text>
              {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
              {streak >= 2 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: colors.accentMuted, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11 }}>🔥</Text>
                  <Text style={{ color: colors.accent, fontSize: 11.5, fontWeight: '800' }}>{streak}</Text>
                </View>
              )}
            </View>
            <Text style={{
              color: partnerIsTyping ? colors.accent : online ? colors.success : colors.textMuted,
              fontSize: 12,
              fontWeight: partnerIsTyping ? '600' : '400',
            }}>
              {conversation.isGroup
                ? (partnerIsTyping ? 'someone is typing…' : `${conversation.memberCount ?? 1} members · tap to manage`)
                : partnerIsTyping ? 'typing…' : online ? 'Online now' : `@${conversation.username}`}
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

        {conversationSaved.length > 0 && !searchOpen && (
          <Pressable
            onPress={() => setShowSaved(true)}
            accessibilityRole="button"
            accessibilityLabel="Saved messages"
            style={({ pressed }) => ({
              width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <BookmarkSimple color={colors.accent} size={17} weight="fill" />
          </Pressable>
        )}
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
          // flexGrow + flex-end anchor short threads to the bottom (just above
          // the composer) instead of floating at the top, like every chat app.
          contentContainerStyle={{ paddingVertical: 10, flexGrow: 1, justifyContent: 'flex-end' }}
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
          ) : conversation ? (
            // First impression: a warm start-of-conversation moment instead of a
            // black void — with an Echo-flavored nudge toward the AI quick-replies.
            <Animated.View entering={FadeIn.duration(300)} style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 }}>
              <Avatar
                name={conversation.displayName}
                color={conversation.avatarColor}
                url={conversation.isGroup ? undefined : conversation.avatarUrl}
                size={78}
              >
                {conversation.isGroup ? <Users color="#fff" size={30} weight="fill" /> : undefined}
              </Avatar>
              <Text style={{ color: colors.text, fontFamily: 'Fraunces_600SemiBold', fontSize: 23, textAlign: 'center', letterSpacing: -0.3 }}>
                {conversation.isGroup ? conversation.displayName : `Say hi to ${conversation.displayName}`}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 }}>
                {conversation.isGroup
                  ? 'This is the start of the group. Send something to get it going.'
                  : 'The start of your conversation. Send the first message — Echo can help you find the words.'}
              </Text>
            </Animated.View>
          ) : null}
          renderItem={({ item }) => {
            if (item.type === 'date') return <DateSeparator label={item.label} />;
            if (item.type === 'unread') return <UnreadDivider count={unreadPartnerMsgs.length} loading={catchupLoading} onCatchUp={handleCatchUp} />;
            const { msg, grouped } = item;
            const firstAppearance = !animatedIds.current.has(msg.id);
            if (firstAppearance) animatedIds.current.add(msg.id);
            const isFresh = new Date(msg.createdAt).getTime() > openedAtRef.current - 2000;
            return (
              <DMBubble
                message={msg}
                isMe={remote ? msg.senderId === myId : msg.senderId === 'me'}
                animate={firstAppearance && isFresh}
                translation={translations[msg.id]}
                translating={translatingId === msg.id}
                saved={savedIdSet.has(msg.id)}
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

        {/* @mention autocomplete */}
        {mentionResults.length > 0 && (
          <View style={{ maxHeight: 210, marginHorizontal: 12, marginBottom: 6, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {mentionResults.map(mem => (
                <Pressable
                  key={mem.userId}
                  onPress={() => insertMention(mem)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}
                >
                  <Avatar name={mem.displayName} color={mem.avatarColor} url={mem.avatarUrl ?? undefined} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{mem.displayName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>@{mem.username}</Text>
                  </View>
                  {mem.role === 'admin' && <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>ADMIN</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Tone / polish — offered while you have a draft */}
        {text.trim().length > 1 && mentionResults.length === 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {[{ id: 'warmer', label: 'Warmer' }, { id: 'shorter', label: 'Shorter' }, { id: 'funnier', label: 'Funnier' }, { id: 'fix', label: 'Fix' }].map(t => {
                const busy = polishing === t.id;
                return (
                  <AnimatedPressable
                    key={t.id}
                    onPress={() => void polishDraft(t.id)}
                    disabled={!!polishing}
                    scaleValue={0.95}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`Rewrite ${t.label}`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full,
                      opacity: polishing && !busy ? 0.5 : 1,
                      backgroundColor: colors.surface,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Sparkle color={colors.textMuted} size={12} weight="fill" />}
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{t.label}</Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Quick starters */}
        {!composerFocused && !editingMessage && !replyingTo && text.trim().length === 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Object.entries({ followup: 'Follow-up', summary: 'Your take', draft: 'Draft' }).map(([key, label]) => {
                const busy = replyLoading === key;
                const disabled = !!replyLoading && !busy;
                return (
                  <AnimatedPressable
                    key={key}
                    onPress={() => void generateSmartReply(key)}
                    disabled={!!replyLoading}
                    scaleValue={0.95}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`Echo: ${label}`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: radius.full, flexShrink: 1,
                      opacity: disabled ? 0.5 : 1,
                      backgroundColor: quickAction === key ? colors.accentMuted : colors.surface,
                      borderWidth: 1, borderColor: quickAction === key ? colors.accent : colors.border,
                    }}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Sparkle color={quickAction === key ? colors.accent : colors.textMuted} size={12} weight="fill" />
                    }
                    <Text style={{
                      color: quickAction === key ? colors.accent : colors.textSecondary,
                      fontSize: 12, fontWeight: '600',
                    }} numberOfLines={1}>
                      {busy ? 'Echo…' : label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
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
                { key: 'stickers', label: 'Stickers', icon: <Sparkle color={colors.accent} size={17} weight="fill" />, onPress: () => { setAttachmentMenuOpen(false); setStickerOpen(true); } },
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
                borderWidth: 1, borderColor: colors.danger + 'AA',
                borderRadius: radius.card,
              }}>
                <Animated.View entering={FadeIn.duration(200)}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
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
        onTranslate={() => { if (activeMessage) void handleTranslate(activeMessage); }}
        onSmartReply={() => void generateSmartReply('draft')}
        onSave={handleToggleSave}
        isSaved={!!activeMessage && savedIdSet.has(activeMessage.id)}
      />

      {effect && <MessageEffect kind={effect} onDone={() => setEffect(null)} />}

      <StickerSheet visible={stickerOpen} onSelect={sendSticker} onClose={() => setStickerOpen(false)} />

      {/* Saved messages */}
      <Modal visible={showSaved} transparent animationType="none" onRequestClose={() => setShowSaved(false)}>
        <Animated.View entering={reduceAnimations ? undefined : FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowSaved(false)} />
        </Animated.View>
        <Animated.View
          entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
          exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingBottom: insets.bottom + 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 10 }}>
              <BookmarkSimple color={colors.accent} size={16} weight="fill" />
              <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Fraunces_600SemiBold', marginLeft: 7, flex: 1 }}>Saved messages</Text>
              <Pressable onPress={() => setShowSaved(false)} hitSlop={10}><X color={colors.textMuted} size={20} /></Pressable>
            </View>
            <FlatList
              data={conversationSaved}
              keyExtractor={s => s.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 3 }}>{item.fromName}</Text>
                    <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
                  </View>
                  <Pressable
                    onPress={() => setSavedMsgs(prev => { const next = prev.filter(s => s.id !== item.id); persistSet('chat:savedMessages', next); return next; })}
                    hitSlop={8}
                  >
                    <BookmarkSimple color={colors.accent} size={18} weight="fill" />
                  </Pressable>
                </View>
              )}
            />
          </View>
        </Animated.View>
      </Modal>


      {/* Catch-me-up summary */}
      <Modal visible={catchup !== null} transparent animationType="none" onRequestClose={() => setCatchup(null)}>
        <Animated.View entering={reduceAnimations ? undefined : FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setCatchup(null)} />
        </Animated.View>
        <Animated.View
          entering={reduceAnimations ? undefined : SlideInDown.duration(220)}
          exiting={reduceAnimations ? undefined : SlideOutDown.duration(160)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 12 }}
        >
          <View style={{ borderRadius: 22, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.accent}44`, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkle color={colors.accent} size={18} weight="fill" />
              <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'Fraunces_600SemiBold' }}>Caught up</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setCatchup(null)} hitSlop={10}><X color={colors.textMuted} size={20} /></Pressable>
            </View>
            {catchupLoading && !catchup ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Reading your unread messages…</Text>
              </View>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23 }}>{catchup}</Text>
            )}
          </View>
        </Animated.View>
      </Modal>

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
