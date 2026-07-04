import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, FlatList,
  TextInput as RNTextInput, Pressable, StyleSheet, Modal,
  ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, PaperPlaneTilt, Quotes, SealCheck,
  Sparkle, Copy, Trash, ArrowBendUpLeft, PencilSimple,
  PushPin, X, ArrowFatLinesUp,
  Camera,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  useRemoteMessages,
  useSendRemoteDM,
  useSendImageDM,
  useEditMessage,
  usePinMessage,
  useRemoteConversation,
  useMarkRead,
  useDeleteMessage,
  useToggleReaction,
  useTypingIndicator,
} from '../../hooks/queries/useDMs';
import { markMessagesRead } from '../../lib/supabaseEchoApi';
import type { RemoteMessageReaction } from '../../lib/supabaseEchoApi';
import type { DirectMessage } from '../../types';

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
  sharedEchoTitle: string | null;
  sharedEchoPreview: string | null;
  sharedEchoAuthor: string | null;
  mediaUrl: string | null;
  replyToId: string | null;
  replyToContent: string | null;
  replyToSenderId: string | null;
  replyToKind: string | null;
  replyToDeleted: boolean;
  reactions: RemoteMessageReaction[];
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

// ─── ReplyCard ────────────────────────────────────────────────────────────────

function ReplyCard({
  content, kind, isDeleted, isMe,
}: { content: string | null; kind: string | null; isDeleted: boolean; isMe: boolean }) {
  const { colors, radius } = useTheme();
  const preview = isDeleted
    ? 'Deleted message'
    : kind === 'image' ? '📷 Photo'
    : kind === 'voice' ? '🎙️ Voice message'
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
  const label = kind === 'image' ? '📷 Photo' : kind === 'voice' ? '🎙️ Voice' : (content ?? '');
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

// ─── DMBubble ────────────────────────────────────────────────────────────────

function DMBubble({
  message, isMe, showReadReceipt, myUserId, grouped,
  onLongPress, onReactionToggle, onReplyPress,
}: {
  message: NormalizedMessage;
  isMe: boolean;
  showReadReceipt: boolean;
  myUserId: string;
  grouped: boolean;
  onLongPress: () => void;
  onReactionToggle: (val: string, hasReacted: boolean) => void;
  onReplyPress: (replyToId: string) => void;
}) {
  const fontSizeSetting = useAppStore(s => s.fontSize);
  const { colors, radius } = useTheme();
  const textSize = ({ small: 14, medium: 16, large: 18 } as Record<string, number>)[fontSizeSetting] ?? 16;
  const isDeleted = !!message.deletedAt;

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
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
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

    if (message.kind === 'echo' && message.sharedEchoTitle) {
      return (
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
          <EchoShareCard
            title={message.sharedEchoTitle}
            preview={message.sharedEchoPreview ?? ''}
            author={message.sharedEchoAuthor ?? undefined}
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
      <View style={{ maxWidth: '82%' }}>
        {renderContent()}

        {!isDeleted && message.reactions.length > 0 && (
          <ReactionBar
            reactions={message.reactions}
            myUserId={myUserId}
            onToggle={onReactionToggle}
          />
        )}
      </View>

      {!grouped && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, marginHorizontal: 2 }}>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{formatTime(message.createdAt)}</Text>
          {message.editedAt && !isDeleted && (
            <Text style={{ color: colors.textMuted, fontSize: 10, fontStyle: 'italic' }}>Edited</Text>
          )}
          {isMe && showReadReceipt && message.isRead && !isDeleted && (
            <Text style={{ color: colors.accent, fontSize: 10 }}>Read</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── MessageActionSheet ───────────────────────────────────────────────────────

function MessageActionSheet({
  visible, message, isOwn, myUserId, isPinned,
  onClose, onCopy, onDelete, onReact, onReply, onEdit, onPin,
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
}) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const glassBg = Platform.OS === 'ios' ? 'transparent' : colors.surface;
  const tint = colors.isDark ? 'dark' : 'extraLight';
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
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 18, paddingVertical: 15,
        opacity: pressed ? 0.6 : 1,
        borderTopWidth: bordered ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.glassBorder,
      })}
    >
      {icon}
      <Text style={{ color: destructive ? '#ef4444' : colors.text, fontSize: 16, fontWeight: '600' }}>
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
          paddingHorizontal: 12, paddingBottom: insets.bottom + 12,
        }}
      >
        {/* Emoji quick-react strip */}
        {!isDeleted && (
          <View style={{
            borderRadius: 18, overflow: 'hidden', marginBottom: 8,
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
            backgroundColor: glassBg,
          }}>
            {Platform.OS === 'ios' && <BlurView intensity={72} tint={tint} style={StyleSheet.absoluteFill} />}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
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
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
          backgroundColor: glassBg,
        }}>
          {Platform.OS === 'ios' && <BlurView intensity={72} tint={tint} style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          {!isDeleted && (
            <Row icon={<ArrowBendUpLeft color={colors.text} size={18} />} label="Reply" onPress={onReply} bordered={false} />
          )}
          {isText && (
            <Row icon={<Copy color={colors.text} size={18} />} label="Copy" onPress={onCopy} />
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
            borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
            paddingVertical: 15, alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
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

  const {
    conversations, getDMs, sendDM, markConversationRead,
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

  const listRef = useRef<FlatList<any>>(null);
  const inputRef = useRef<RNTextInput>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remote = isSupabaseRemote();
  const myId = userId ?? 'me';

  // Conversation resolution
  const localConversation = conversations.find(c => c.id === id);
  const { data: remoteConvData, isLoading: convLoading } = useRemoteConversation(
    remote && !localConversation ? id : undefined,
  );

  const conversation = localConversation ?? (remoteConvData
    ? {
        id: remoteConvData.id,
        userId: remoteConvData.otherUserId,
        username: remoteConvData.otherUsername,
        displayName: remoteConvData.otherDisplayName,
        avatarColor: remoteConvData.otherAvatarColor,
        isVerified: false,
        lastMessage: remoteConvData.lastMessage ?? '',
        lastMessageAt: remoteConvData.lastMessageAt ?? new Date().toISOString(),
        unreadCount: 0,
      }
    : null);

  const pinnedMessage = remoteConvData?.pinnedMessage ?? null;

  // Remote hooks
  const { data: remoteMessagePages, fetchNextPage, hasNextPage } = useRemoteMessages(remote ? id : undefined);
  const remoteMessages = (remoteMessagePages?.pages ?? []).flat();
  const sendRemote = useSendRemoteDM(id, conversation?.userId);
  const sendImageDM = useSendImageDM(id, conversation?.userId);
  const editMessage = useEditMessage(id);
  const pinMessage = usePinMessage(id);
  const { mutate: doMarkRead } = useMarkRead();
  const deleteMessage = useDeleteMessage(id);
  const toggleReaction = useToggleReaction(id);
  const { partnerIsTyping, sendTypingEvent } = useTypingIndicator(
    remote ? id : undefined,
    remote ? myId : undefined,
  );

  // Message normalization
  const localMessages = (id ? getDMs(id) : []) as DirectMessage[];

  const messages: NormalizedMessage[] = remote
    ? remoteMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        isRead: !!m.readAt,
        deletedAt: m.deletedAt,
        editedAt: m.editedAt,
        kind: m.kind,
        sharedEchoTitle: m.kind === 'echo' ? (m.content ?? 'Shared Echo') : null,
        sharedEchoPreview: null,
        sharedEchoAuthor: null,
        mediaUrl: m.mediaUrl,
        replyToId: m.replyToId,
        replyToContent: m.replyToContent,
        replyToSenderId: m.replyToSenderId,
        replyToKind: m.replyToKind,
        replyToDeleted: m.replyToDeleted,
        reactions: m.reactions,
      }))
    : localMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        isRead: m.isRead,
        deletedAt: null,
        editedAt: null,
        kind: m.sharedEchoTitle ? 'echo' : 'text',
        sharedEchoTitle: m.sharedEchoTitle ?? null,
        sharedEchoPreview: m.sharedEchoPreview ?? null,
        sharedEchoAuthor: m.sharedEchoAuthor ?? null,
        mediaUrl: null,
        replyToId: null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      }));

  const online = conversation ? isUserOnline(conversation.userId) : false;

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
    const echoPreviewText = echoPreview ? `\n${echoPreview}` : '';
    sendRemote.mutate({
      content: `Shared Echo: "${String(echoTitle)}"${echoPreviewText}${echoAuthor ? `\n${echoAuthor}` : ''}`,
    }, {
      onError: () => Alert.alert('Error', 'Failed to share Echo. Please try again.'),
    });
    setSharedPending(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedPending, echoId, remote, conversation?.id]);

  useEffect(() => {
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, []);

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

    if (remote) {
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
  }, [text, id, hapticEnabled, remote, sendRemote, sendDM, editingMessage, editMessage, replyingTo]);

  const handlePickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUploading(true);
    try {
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
        onError: () => Alert.alert('Error', 'Failed to send image. Please try again.'),
      });
    } catch {
      setImageUploading(false);
    }
  }, [sendImageDM, replyingTo]);

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

  // Build list data with date separators
  type ListRow =
    | { type: 'message'; msg: NormalizedMessage; grouped: boolean }
    | { type: 'date'; label: string };

  const listData: ListRow[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !isSameDay(msg.createdAt, prev.createdAt)) {
      listData.push({ type: 'date', label: getDateLabel(msg.createdAt) });
    }
    listData.push({ type: 'message', msg, grouped: isGroupedWithPrev(msg, prev) });
  });

  // Loading / not found
  if (!conversation) {
    if (remote && convLoading) {
      return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
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
        <Pressable onPress={() => router.back()}>
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
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 10 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>

        <View style={{ position: 'relative', marginRight: 10 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: conversation.avatarColor,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {(conversation.displayName ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          {online && (
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 11, height: 11, borderRadius: 6,
              backgroundColor: colors.success, borderWidth: 2, borderColor: colors.bg,
            }} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
              {conversation.displayName}
            </Text>
            {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
          </View>
          <Text style={{ color: online ? colors.success : colors.textMuted, fontSize: 12 }}>
            {online ? 'Online now' : `@${conversation.username}`}
          </Text>
        </View>
      </View>

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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Message list */}
        <FlatList<ListRow>
          ref={listRef}
          data={listData}
          keyExtractor={(item, i) => item.type === 'date' ? `date-${i}` : item.msg.id}
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
          renderItem={({ item }) => {
            if (item.type === 'date') return <DateSeparator label={item.label} />;
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
        {!editingMessage && !replyingTo && (
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

        {/* Input bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
          borderTopWidth: 1, borderTopColor: colors.border,
          gap: 8,
        }}>
          {/* Image picker */}
          {!editingMessage && (
            <Pressable
              onPress={handlePickImage}
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
                : <Camera color={colors.textSecondary} size={18} weight="regular" />
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
              multiline
              maxLength={2000}
            />
          </View>

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
        </View>

      </KeyboardAvoidingView>

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
      />
    </SafeAreaView>
  );
}
