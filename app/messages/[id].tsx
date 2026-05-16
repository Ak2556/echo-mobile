import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, FlatList,
  TextInput as RNTextInput, Pressable, StyleSheet, Modal, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, PaperPlaneTilt, Quotes, SealCheck,
  Sparkle, Copy, Trash,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  useRemoteMessages,
  useSendRemoteDM,
  useRemoteConversation,
  useMarkRead,
  useDeleteMessage,
  useToggleReaction,
  useTypingIndicator,
} from '../../hooks/queries/useDMs';
import { markMessagesRead } from '../../lib/supabaseEchoApi';
import type { RemoteDirectMessage, RemoteMessageReaction } from '../../lib/supabaseEchoApi';
import type { DirectMessage } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '💡', '😮'] as const;

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
  kind: string;
  sharedEchoTitle: string | null;
  sharedEchoPreview: string | null;
  sharedEchoAuthor: string | null;
  reactions: RemoteMessageReaction[];
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
      {author ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>From {author}</Text>
      ) : null}
    </View>
  );
}

// ─── ReactionBar ──────────────────────────────────────────────────────────────

function ReactionBar({
  reactions, myUserId, onToggle,
}: {
  reactions: RemoteMessageReaction[];
  myUserId: string;
  onToggle: (emoji: string, hasReacted: boolean) => void;
}) {
  const { colors } = useTheme();
  if (!reactions.length) return null;

  const grouped: Record<string, { count: number; hasReacted: boolean }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, hasReacted: false };
    grouped[r.emoji].count++;
    if (r.userId === myUserId) grouped[r.emoji].hasReacted = true;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {Object.entries(grouped).map(([emoji, { count, hasReacted }]) => (
        <Pressable
          key={emoji}
          onPress={() => onToggle(emoji, hasReacted)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
            backgroundColor: hasReacted ? colors.accentMuted : colors.surface,
            borderWidth: 1, borderColor: hasReacted ? colors.accent : colors.border,
          }}
        >
          <Text style={{ fontSize: 14 }}>{emoji}</Text>
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

// ─── DMBubble ─────────────────────────────────────────────────────────────────

function DMBubble({
  message, isMe, showReadReceipt, myUserId, onLongPress, onReactionToggle,
}: {
  message: NormalizedMessage;
  isMe: boolean;
  showReadReceipt: boolean;
  myUserId: string;
  onLongPress: () => void;
  onReactionToggle: (emoji: string, hasReacted: boolean) => void;
}) {
  const fontSizeSetting = useAppStore(s => s.fontSize);
  const { colors, radius } = useTheme();
  const textSize = ({ small: 14, medium: 16, large: 18 } as Record<string, number>)[fontSizeSetting] ?? 16;
  const isDeleted = !!message.deletedAt;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 4, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      <View style={{ maxWidth: '82%' }}>
        <Pressable onLongPress={onLongPress} delayLongPress={350}>
          {isDeleted ? (
            <View style={{
              paddingHorizontal: 14, paddingVertical: 10,
              borderRadius: radius.card,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
            }}>
              <Text style={{ color: colors.textMuted, fontSize: textSize * 0.88, fontStyle: 'italic' }}>
                This message was deleted
              </Text>
            </View>
          ) : message.kind === 'echo' && message.sharedEchoTitle ? (
            <EchoShareCard
              title={message.sharedEchoTitle}
              preview={message.sharedEchoPreview ?? ''}
              author={message.sharedEchoAuthor ?? undefined}
            />
          ) : message.content ? (
            <View style={{
              paddingHorizontal: 14, paddingVertical: 11,
              borderRadius: radius.card,
              backgroundColor: isMe ? colors.accent : colors.surface,
              borderWidth: isMe ? 0 : 1,
              borderColor: colors.border,
            }}>
              <Text style={{
                color: isMe ? '#fff' : colors.text,
                fontSize: textSize, lineHeight: textSize * 1.38,
              }}>
                {message.content}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {!isDeleted && message.reactions.length > 0 && (
          <ReactionBar
            reactions={message.reactions}
            myUserId={myUserId}
            onToggle={onReactionToggle}
          />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, marginHorizontal: 2 }}>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {isMe && showReadReceipt && message.isRead && !isDeleted ? (
          <Text style={{ color: colors.accent, fontSize: 10 }}>Read</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── MessageActionSheet ───────────────────────────────────────────────────────

function MessageActionSheet({
  visible, message, isOwn, myUserId, onClose, onCopy, onDelete, onReact,
}: {
  visible: boolean;
  message: NormalizedMessage | null;
  isOwn: boolean;
  myUserId: string;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReact: (emoji: string, hasReacted: boolean) => void;
}) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const glassBg = Platform.OS === 'ios' ? 'transparent' : colors.surface;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const Row = ({
    icon, label, destructive, onPress,
    bordered = true,
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
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        entering={reduceAnimations ? undefined : SlideInDown.springify().damping(18)}
        exiting={reduceAnimations ? undefined : SlideOutDown.duration(150)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {/* Emoji quick-react strip */}
        <View style={{
          borderRadius: 18, overflow: 'hidden', marginBottom: 8,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
          backgroundColor: glassBg,
        }}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={72} tint={tint} style={StyleSheet.absoluteFill} />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 4 }}>
            {QUICK_EMOJIS.map(emoji => {
              const alreadyReacted = message.reactions.some(r => r.emoji === emoji && r.userId === myUserId);
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
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={{
          borderRadius: 18, overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
          backgroundColor: glassBg,
        }}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={72} tint={tint} style={StyleSheet.absoluteFill} />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          <Row icon={<Copy color={colors.text} size={18} />} label="Copy" onPress={onCopy} bordered={false} />
          {isOwn && !message.deletedAt && (
            <Row
              icon={<Trash color="#ef4444" size={18} />}
              label="Delete message"
              destructive
              onPress={onDelete}
            />
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
  const listRef = useRef<FlatList<NormalizedMessage>>(null);

  const remote = isSupabaseRemote();
  const myId = userId ?? 'me';

  // ── Conversation resolution ─────────────────────────────────────────────────
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

  // ── Remote hooks ────────────────────────────────────────────────────────────
  const {
    data: remoteMessagePages,
    fetchNextPage, hasNextPage,
  } = useRemoteMessages(remote ? id : undefined);

  const remoteMessages = (remoteMessagePages?.pages ?? []).flat();
  const sendRemote = useSendRemoteDM(id, conversation?.userId);
  const { mutate: doMarkRead } = useMarkRead();
  const deleteMessage = useDeleteMessage(id);
  const toggleReaction = useToggleReaction(id);
  const { partnerIsTyping, sendTypingEvent } = useTypingIndicator(
    remote ? id : undefined,
    remote ? myId : undefined,
  );

  // ── Message normalization ───────────────────────────────────────────────────
  const localMessages = (id ? getDMs(id) : []) as DirectMessage[];

  const messages: NormalizedMessage[] = remote
    ? remoteMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        isRead: !!m.readAt,
        deletedAt: m.deletedAt,
        kind: m.kind,
        sharedEchoTitle: m.kind === 'echo' ? (m.content ?? 'Shared Echo') : null,
        sharedEchoPreview: null,
        sharedEchoAuthor: null,
        reactions: m.reactions,
      }))
    : localMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        isRead: m.isRead,
        deletedAt: null,
        kind: m.sharedEchoTitle ? 'echo' : 'text',
        sharedEchoTitle: m.sharedEchoTitle ?? null,
        sharedEchoPreview: m.sharedEchoPreview ?? null,
        sharedEchoAuthor: m.sharedEchoAuthor ?? null,
        reactions: [],
      }));

  const online = conversation ? isUserOnline(conversation.userId) : false;

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Local mark-as-read
  useEffect(() => {
    if (id) markConversationRead(id);
  }, [id, markConversationRead]);

  // Remote mark-as-read (once on mount)
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

    // Remote: compose as rich text (echo-kind DM is a future enhancement)
    const echoPreviewText = echoPreview ? `\n${echoPreview}` : '';
    sendRemote.mutate({
      content: `📎 "${String(echoTitle)}"${echoPreviewText}${echoAuthor ? `\n— ${echoAuthor}` : ''}`,
    });
    setSharedPending(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedPending, echoId, remote, conversation?.id]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !id) return;
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setText('');
    setQuickAction(null);
    if (remote) {
      sendRemote.mutate({ content });
    } else {
      sendDM(id, content);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [text, id, hapticEnabled, remote, sendRemote, sendDM]);

  const handleLongPress = useCallback((message: NormalizedMessage) => {
    if (message.deletedAt) return;
    if (hapticEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveMessage(message);
    setActionSheetVisible(true);
  }, [hapticEnabled]);

  const handleCopy = useCallback(() => {
    if (activeMessage?.content) void Share.share({ message: activeMessage.content });
  }, [activeMessage]);

  const handleDelete = useCallback(() => {
    if (!activeMessage || !remote) return;
    deleteMessage.mutate(activeMessage.id);
  }, [activeMessage, remote, deleteMessage]);

  const handleReact = useCallback((emoji: string, hasReacted: boolean) => {
    if (!activeMessage || !remote) return;
    toggleReaction.mutate({ messageId: activeMessage.id, emoji, hasReacted });
  }, [activeMessage, remote, toggleReaction]);

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    if (remote && t.length > 0) sendTypingEvent();
  }, [remote, sendTypingEvent]);

  // ── Loading / not found ─────────────────────────────────────────────────────

  if (!conversation) {
    if (remote && convLoading) {
      return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <AnimatedPressable onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }} scaleValue={0.88} haptic="light">
              <ArrowLeft color={colors.text} size={24} />
            </AnimatedPressable>
          </View>
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <AnimatedPressable
          onPress={() => router.back()}
          style={{ padding: 4, marginRight: 10 }}
          scaleValue={0.88}
          haptic="light"
        >
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>

        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: conversation.avatarColor,
          alignItems: 'center', justifyContent: 'center', marginRight: 10,
        }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {conversation.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        {online && (
          <View style={{
            position: 'absolute', left: 46, top: 34,
            width: 11, height: 11, borderRadius: 6,
            backgroundColor: colors.success,
            borderWidth: 2, borderColor: colors.bg,
          }} />
        )}

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
        <FlatList<NormalizedMessage>
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 10 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onEndReached={() => { if (hasNextPage) void fetchNextPage(); }}
          onEndReachedThreshold={0.25}
          ListFooterComponent={partnerIsTyping ? <TypingDots /> : null}
          renderItem={({ item }) => (
            <DMBubble
              message={item}
              isMe={remote ? item.senderId === myId : item.senderId === 'me'}
              showReadReceipt={readReceipts}
              myUserId={myId}
              onLongPress={() => handleLongPress(item)}
              onReactionToggle={(emoji, hasReacted) => {
                if (!remote) return;
                toggleReaction.mutate({ messageId: item.id, emoji, hasReacted });
              }}
            />
          )}
        />

        {/* Quick starters */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.entries({ followup: 'Follow-up', summary: 'Your take', draft: 'Draft' }).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => {
                  setQuickAction(key);
                  setText(QUICK_STARTERS[key]);
                }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderRadius: radius.full, flexShrink: 1,
                  backgroundColor: quickAction === key ? colors.accentMuted : colors.surface,
                  borderWidth: 1,
                  borderColor: quickAction === key ? colors.accent : colors.border,
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

        {/* Input bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
          borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <View style={{
            flex: 1, marginRight: 10, minHeight: 48,
            justifyContent: 'center',
            paddingHorizontal: 14, paddingVertical: 8,
            backgroundColor: colors.inputBg,
            borderWidth: 1, borderColor: colors.inputBorder,
            borderRadius: radius.card,
          }}>
            <RNTextInput
              style={{ color: colors.text, fontSize: 16, lineHeight: 22, maxHeight: 120 }}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={2000}
            />
          </View>
          <AnimatedPressable
            onPress={handleSend}
            disabled={!text.trim()}
            scaleValue={0.9}
            haptic="medium"
            style={{
              padding: 13, borderRadius: 999,
              backgroundColor: text.trim() ? colors.accent : colors.surfaceHover,
            }}
          >
            <PaperPlaneTilt color="#fff" size={18} weight="fill" />
          </AnimatedPressable>
        </View>

      </KeyboardAvoidingView>

      {/* Message action sheet */}
      <MessageActionSheet
        visible={actionSheetVisible}
        message={activeMessage}
        isOwn={remote
          ? activeMessage?.senderId === myId
          : activeMessage?.senderId === 'me'}
        myUserId={myId}
        onClose={() => setActionSheetVisible(false)}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onReact={handleReact}
      />
    </SafeAreaView>
  );
}
