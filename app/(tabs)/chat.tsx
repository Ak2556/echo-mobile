import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, StyleSheet, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, type Href } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { MessageBubble, Message } from '../../components/ai/MessageBubble';
import { ChatInput } from '../../components/ai/ChatInput';
import { ActionCenter } from '../../components/ai/ActionCenter';
import { ToolCallCard, ToolCallItem } from '../../components/ai/ToolCallCard';
import { TypingIndicator } from '../../components/ui/TypingIndicator';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { SessionsDrawer } from '../../components/ai/SessionsDrawer';
import { EditMessageModal } from '../../components/ai/EditMessageModal';
import { ModelPickerSheet } from '../../components/chat/ModelPickerSheet';
import { streamEchoAI, isRateLimitError } from '../../lib/api';
import { isLocalTool, LocalToolContext } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { generateSessionTitle } from '../../lib/aiTitle';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ShareNetwork, Plus, Lightning, List, Question, ArrowUpRight, Envelope, SealCheck, PencilSimple, Sparkle, Target, SquaresFour, NotePencil, ChartLineUp } from 'phosphor-react-native';
import { ChatMessage } from '../../types';
import { peekPendingPublishContext, setPendingPublishContext } from '../../lib/publishContext';
import { track } from '../../lib/analytics';
import { useResponsiveLayout } from '../../lib/responsive';
import { buildPersonaPromptContext, loadPersonaProfile, recordPersonaSignal, syncPersonaFromMessages } from '../../lib/persona';
import { playSoundEffect } from '../../lib/sound';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteConversations } from '../../hooks/queries/useDMs';
import type { RemoteConversation } from '../../lib/supabaseEchoApi';
import type { Conversation } from '../../types';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { getTargetCategory } from '../../lib/targetCategories';
import { miniAppById } from '../../lib/miniAppCatalog';

// ─── DM colour token (teal, distinct from AI accent) ────────────────────────
const DM_COLOR = '#0ea5e9';

// ─── DMConversationCard ───────────────────────────────────────────────────────
function DMConversationCard({ conv, onPress }: { conv: Conversation; onPress: () => void }) {
  const { colors, font, fontSizes, isUserOnline } = useTheme();
  function ago(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
  const hasUnread = conv.unreadCount > 0;
  const online = isUserOnline(conv.userId);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 14,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ position: 'relative', marginRight: 12 }}>
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: conv.avatarColor,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
            {conv.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        {online && (
          <View style={{
            position: 'absolute', bottom: 0, right: 1,
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: colors.success,
            borderWidth: 2, borderColor: colors.bg,
          }} />
        )}
        {hasUnread && (
          <View style={{
            position: 'absolute', top: -2, right: -4,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: DM_COLOR,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: colors.bg,
          }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <Text style={{
            flexShrink: 1,
            color: colors.text,
            fontFamily: hasUnread ? 'Inter_700Bold' : 'Inter_600SemiBold',
            fontSize: fontSizes.body,
          }} numberOfLines={1}>
            {conv.displayName}
          </Text>
          {conv.isVerified && <SealCheck color={DM_COLOR} size={13} weight="fill" />}
          {online && (
            <Text style={{ color: colors.success, fontSize: fontSizes.caption }} numberOfLines={1}>
              online
            </Text>
          )}
        </View>
        <Text style={{
          color: hasUnread ? colors.textSecondary : colors.textMuted,
          fontSize: fontSizes.small,
          fontFamily: hasUnread ? 'Inter_500Medium' : 'Inter_400Regular',
        }} numberOfLines={1}>
          {conv.lastMessage || `@${conv.username}`}
        </Text>
      </View>
      <Text style={[font.body, { color: colors.textMuted, fontSize: fontSizes.caption, marginLeft: 10, flexShrink: 0 }]}>
        {ago(conv.lastMessageAt)}
      </Text>
    </Pressable>
  );
}

function DMInboxHero({ count, onNew }: { count: number; onNew: () => void }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 14 }}>
      <LinearGradient
        colors={[`${DM_COLOR}3A`, `${DM_COLOR}10`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: `${DM_COLOR}20`, alignItems: 'center', justifyContent: 'center' }}>
            <Envelope color={DM_COLOR} size={24} weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[font.display, { color: colors.text, fontSize: 25, lineHeight: 30 }]}>Messages</Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 13, marginTop: 2 }]} numberOfLines={2}>
              {count ? `${count} conversation${count === 1 ? '' : 's'} ready to continue.` : 'Start private chats from profiles or shared progress.'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onNew}
          style={{ minHeight: 42, borderRadius: 15, backgroundColor: DM_COLOR, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          <PencilSimple color="#fff" size={17} weight="bold" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 14 }]}>Open full inbox</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── DMInboxView ─────────────────────────────────────────────────────────────
function DMInboxView({ topPad }: { topPad: number }) {
  const router = useRouter();
  const { colors, fontSizes } = useTheme();
  const layout = useResponsiveLayout();
  const remote = isSupabaseRemote();
  const localConversations = useAppStore(s => s.conversations);
  const { data: remoteConvs = [], isLoading } = useRemoteConversations();

  const conversations: Conversation[] = remote
    ? remoteConvs.map((rc: RemoteConversation) => ({
        id: rc.id,
        userId: rc.otherUserId,
        username: rc.otherUsername,
        displayName: rc.otherDisplayName,
        avatarColor: rc.otherAvatarColor,
        isVerified: false,
        lastMessage: rc.lastMessage ?? '',
        lastMessageAt: rc.lastMessageAt ?? new Date().toISOString(),
        unreadCount: rc.unreadCount,
      }))
    : localConversations;

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  if (remote && isLoading) {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: topPad + 12,
          paddingHorizontal: layout.gutter,
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <FeedCardSkeleton />
        <FeedCardSkeleton />
        <FeedCardSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={sorted}
        keyExtractor={c => c.id}
        contentContainerStyle={{
          paddingTop: topPad + 12,
          paddingBottom: layout.bottomChromePadding + 16,
          paddingHorizontal: layout.gutter,
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          gap: 10,
        }}
        ListHeaderComponent={<DMInboxHero count={sorted.length} onNew={() => router.push('/messages' as Href)} />}
        ListEmptyComponent={
          <View style={{ paddingTop: 28, alignItems: 'center', gap: 8 }}>
            <Envelope color={colors.textMuted} size={36} weight="thin" />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }}>
              No messages yet.{'\n'}Go to someone&apos;s profile and tap Message.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <DMConversationCard
            conv={item}
            onPress={() => router.push(`/messages/${item.id}` as Href)}
          />
        )}
      />
    </View>
  );
}

const EMPTY_SUGGESTIONS = [
  { label: 'Target plan', prompt: 'Help me make progress on my target today' },
  { label: 'Draft Echo', prompt: 'Turn my rough idea into a clear Echo' },
  { label: 'Next 3 actions', prompt: 'Plan my next 3 focused actions' },
  { label: 'Challenge me', prompt: 'Challenge my thinking on this decision' },
];

function modelLabel(model: string): string {
  if (model.includes('pro')) return 'Pro';
  if (model.includes('lite')) return 'Lite';
  return 'Flash';
}

function HeaderIconButton({ icon, onPress, label, accent = false }: { icon: React.ReactNode; onPress: () => void; label: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: accent ? colors.accent : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: accent ? colors.accent : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      scaleValue={0.9}
      haptic="light"
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {icon}
    </AnimatedPressable>
  );
}

function ModeSwitch({ mode, onChange }: { mode: 'ai' | 'dm'; onChange: (mode: 'ai' | 'dm') => void }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: 999, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      {([
        { key: 'ai' as const, label: 'AI Chat', Icon: Lightning, color: colors.accent },
        { key: 'dm' as const, label: 'Messages', Icon: Envelope, color: DM_COLOR },
      ]).map(item => {
        const active = mode === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              minHeight: 32,
              borderRadius: 999,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: active ? item.color : 'transparent',
            }}
          >
            <item.Icon color={active ? '#fff' : colors.textSecondary} size={14} weight={active ? 'fill' : 'regular'} />
            <Text style={[font.bodyBold, { color: active ? '#fff' : colors.textSecondary, fontSize: 12 }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChatEmptyLaunchpad({
  targetLabel,
  targetOutcome,
  targetAppIds,
  onPrompt,
  showPrivacy,
}: {
  targetLabel: string;
  targetOutcome: string;
  targetAppIds: string[];
  onPrompt: (value: string) => void;
  showPrivacy: boolean;
}) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const router = useRouter();
  const toolApps = targetAppIds.map(id => miniAppById(id)).filter(Boolean).slice(0, 3);
  const quickActions = [
    {
      key: 'target',
      title: 'Move my target',
      subtitle: targetLabel,
      icon: <Target color={colors.accent} size={19} weight="bold" />,
      onPress: () => onPrompt('Help me make meaningful progress on my target today. Ask me only what you need, then give me the next 3 actions.'),
    },
    {
      key: 'draft',
      title: 'Draft an Echo',
      subtitle: 'Turn an idea into a post',
      icon: <NotePencil color={colors.accent} size={19} weight="bold" />,
      onPress: () => onPrompt('Help me turn this rough idea into a clear Echo that people would want to respond to: '),
    },
    {
      key: 'tools',
      title: 'Open tools',
      subtitle: toolApps.map(app => app?.name).filter(Boolean).join(' · ') || 'Mini apps',
      icon: <SquaresFour color={colors.accent} size={19} weight="bold" />,
      onPress: () => router.push('/(tabs)/apps' as Href),
    },
  ];

  return (
    <View style={[layout.contentStyle, { paddingHorizontal: layout.gutter, paddingTop: layout.isPhone ? 12 : 18, paddingBottom: 28, gap: 14 }]}>
      <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <LinearGradient
          colors={[`${colors.accent}4A`, `${colors.accent}18`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ padding: layout.isPhone ? 18 : 22, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13 }}>
            <View style={{ width: 50, height: 50, borderRadius: 18, backgroundColor: `${colors.accent}22`, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              <Sparkle color={colors.accent} size={28} weight="fill" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[font.display, { color: colors.text, fontSize: layout.isPhone ? 28 : 34, lineHeight: layout.isPhone ? 33 : 40 }]}>
                What should Echo help you finish?
              </Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 }]} numberOfLines={2}>
                {targetOutcome || `Start with ${targetLabel.toLowerCase()}, a draft, or a decision.`}
              </Text>
              {showPrivacy ? (
                <Text style={[font.body, { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 8 }]} numberOfLines={1}>
                  Avoid private details in AI prompts.
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => onPrompt('Echo, help me with ')}
            accessibilityRole="button"
            style={{
              minHeight: 52,
              borderRadius: 20,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={[font.body, { flex: 1, color: colors.textMuted, fontSize: 16 }]} numberOfLines={1}>
              Ask Echo anything...
            </Text>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight color="#fff" size={17} weight="bold" />
            </View>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 9 }}>
        {quickActions.map(action => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            accessibilityRole="button"
            style={{
              minHeight: 56,
              borderRadius: 18,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: `${colors.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
              {action.icon}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]} numberOfLines={1}>{action.title}</Text>
              <Text style={[font.body, { color: colors.textMuted, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>{action.subtitle}</Text>
            </View>
            {action.key === 'target' ? <ChartLineUp color={colors.textMuted} size={17} weight="bold" /> : <ArrowUpRight color={colors.textMuted} size={17} weight="bold" />}
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMPTY_SUGGESTIONS.map(suggestion => (
          <AnimatedPressable
            key={suggestion.label}
            onPress={() => onPrompt(suggestion.prompt)}
            fadeOnPress
            style={{
              borderRadius: 999,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]} numberOfLines={1}>{suggestion.label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}


type ChatItem =
  | { kind: 'text'; message: Message; isStreaming?: boolean }
  | { kind: 'tool'; tool: ToolCallItem };

export default function ChatScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, animation, reduceAnimations } = useTheme();
  const showTyping = useAppStore(s => s.showTypingIndicator);
  const aiModel = useAppStore(s => s.aiModel);
  const setAiModel = useAppStore(s => s.setAiModel);
  const sessions = useAppStore(s => s.sessions);
  const currentSessionId = useAppStore(s => s.currentSessionId);
  const conversationIdBySession = useAppStore(s => s.conversationIdBySession);
  const messagesBySession = useAppStore(s => s.messagesBySession);
  const createSession = useAppStore(s => s.createSession);
  const setCurrentSessionId = useAppStore(s => s.setCurrentSessionId);
  const setSessionConversationId = useAppStore(s => s.setSessionConversationId);
  const updateSessionTitle = useAppStore(s => s.updateSessionTitle);
  const updateSessionLastMessage = useAppStore(s => s.updateSessionLastMessage);
  const addMessage = useAppStore(s => s.addMessage);
  const updateMessage = useAppStore(s => s.updateMessage);
  const truncateMessagesAfter = useAppStore(s => s.truncateMessagesAfter);
  const branchSession = useAppStore(s => s.branchSession);
  const hasSeenChatTabHint = useAppStore(s => s.hasSeenChatTabHint);
  const setHasSeenChatTabHint = useAppStore(s => s.setHasSeenChatTabHint);
  const hasSeenChatEmptyHint = useAppStore(s => s.hasSeenChatEmptyHint);
  const autoSaveChats = useAppStore(s => s.autoSaveChats);
  const deleteSession = useAppStore(s => s.deleteSession);
  const streamResponses = useAppStore(s => s.streamResponses);
  const personaLearningEnabled = useAppStore(s => s.personaLearningEnabled);
  const accountUserId = useAppStore(s => s.userId);
  const targetCategoryId = useAppStore(s => s.targetCategory);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const targetMiniApps = useAppStore(s => s.targetMiniApps);
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const useBlurHeader = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Mode: AI chat vs DM inbox
  const [chatMode, setChatMode] = useState<'ai' | 'dm'>('ai');

  // Ephemeral live items: persisted text messages + transient tool cards.
  const [toolItems, setToolItems] = useState<Record<string, ToolCallItem>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [showActionCenter, setShowActionCenter] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const listRef = useRef<any>(null);
  const didInitialPersonaSyncRef = useRef(false);
  const targetCategory = useMemo(() => getTargetCategory(targetCategoryId), [targetCategoryId]);

  // Stop handle — set by openStream, called to cancel mid-stream.
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Delta buffer: accumulates token deltas between 50ms flush ticks.
  // Reduces Zustand + MMKV writes from ~per-token to 20/sec.
  const deltaBufferRef = useRef<Map<string, { content: string; role: 'user' | 'assistant' }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushDeltas = useCallback(() => {
    if (!currentSessionId || deltaBufferRef.current.size === 0) return;
    deltaBufferRef.current.forEach(({ content }, id) => {
      updateMessage(currentSessionId, id, content);
    });
  }, [currentSessionId, updateMessage]);

  const startFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(flushDeltas, 50);
  }, [flushDeltas]);

  const stopFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushDeltas(); // final flush
    deltaBufferRef.current.clear();
  }, [flushDeltas]);

  // Bootstrap: ensure there is a current session.
  useEffect(() => {
    if (!currentSessionId) {
      const fallback = sessions[0]?.id;
      if (fallback) setCurrentSessionId(fallback);
      else createSession();
    }
  }, [currentSessionId, sessions, setCurrentSessionId, createSession]);

  // Keep latest values in refs so the unmount cleanup can read them.
  const autoSaveChatsRef = useRef(autoSaveChats);
  autoSaveChatsRef.current = autoSaveChats;
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  const streamResponsesRef = useRef(streamResponses);
  streamResponsesRef.current = streamResponses;

  // When auto-save is off, discard the session when the user leaves the screen.
  useEffect(() => {
    return () => {
      if (!autoSaveChatsRef.current && currentSessionIdRef.current) {
        deleteSession(currentSessionIdRef.current);
      }
    };
  }, [deleteSession]);

  // Show command-palette hint once on first focus.
  useEffect(() => {
    if (!hasSeenChatTabHint) {
      const t = setTimeout(() => setShowHint(true), 600);
      const dismissAt = setTimeout(() => {
        setShowHint(false);
        setHasSeenChatTabHint(true);
      }, 6500);
      return () => { clearTimeout(t); clearTimeout(dismissAt); };
    }
  }, [hasSeenChatTabHint, setHasSeenChatTabHint]);

  useEffect(() => {
    const persona = loadPersonaProfile(accountUserId);
    if (!personaLearningEnabled || !persona.enabled) {
      didInitialPersonaSyncRef.current = false;
      return;
    }
    if (!didInitialPersonaSyncRef.current) {
      syncPersonaFromMessages(useAppStore.getState().messagesBySession, accountUserId);
      didInitialPersonaSyncRef.current = true;
    }
  }, [personaLearningEnabled, accountUserId]);

  const messages: ChatMessage[] = useMemo(
    () => (currentSessionId ? messagesBySession[currentSessionId] || [] : []),
    [currentSessionId, messagesBySession],
  );
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = currentSessionId ? (conversationIdBySession[currentSessionId] ?? null) : null;
  }, [currentSessionId, conversationIdBySession]);

  const items: ChatItem[] = useMemo(() => {
    const textItems: ChatItem[] = messages.map(m => ({
      kind: 'text',
      message: { id: m.id, role: m.role, content: m.content },
      isStreaming: isStreaming && m.id === streamingMsgId,
    }));
    const tools: ChatItem[] = Object.values(toolItems).map(t => ({ kind: 'tool', tool: t }));
    return [...textItems, ...tools];
  }, [messages, toolItems, isStreaming, streamingMsgId]);

  // extraData includes content length of last message so FlashList re-renders during streaming
  const extraData = useMemo(
    () => items.length + (messages[messages.length - 1]?.content?.length ?? 0),
    [items.length, messages],
  );

  const setConvId = useCallback((id: string) => {
    if (currentSessionId) setSessionConversationId(currentSessionId, id);
    conversationIdRef.current = id;
  }, [currentSessionId, setSessionConversationId]);

  // Accumulate deltas in buffer — only flush to Zustand/MMKV every 50ms
  const upsertText = useCallback((id: string, role: 'user' | 'assistant', delta: string) => {
    if (!currentSessionId) return;

    const buffered = deltaBufferRef.current.get(id);
    if (buffered) {
      // Accumulate
      deltaBufferRef.current.set(id, { content: buffered.content + delta, role });
    } else {
      const existing = (useAppStore.getState().messagesBySession[currentSessionId] || []).find(m => m.id === id);
      if (existing) {
        deltaBufferRef.current.set(id, { content: existing.content + delta, role });
      } else {
        // First token — create the message immediately so it appears
        addMessage(currentSessionId, { id, role, content: delta, createdAt: new Date().toISOString() });
        deltaBufferRef.current.set(id, { content: delta, role });
      }
    }
  }, [currentSessionId, addMessage]);

  const upsertTool = useCallback((tool: ToolCallItem) => {
    setToolItems(prev => ({ ...prev, [tool.id]: tool }));
  }, []);

  const continueWithLocalResult = useCallback(
    async (tool: ToolCallItem, ok: boolean, result?: any, error?: string) => {
      const assistantId = `a-${Date.now()}`;
      setStreamingMsgId(assistantId);
      setIsStreaming(true);
      startFlush();
      try {
        await streamEchoAI({
          preferredModel: aiModel,
          conversationId: conversationIdRef.current ?? undefined,
          localResult: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, ok, result, error },
          personaContext: buildPersonaPromptContext(loadPersonaProfile(accountUserId)),
          onAbortHandle: (stop) => { stopStreamRef.current = stop; },
          onEvent: (e) => {
            if (e.type === 'conversation') setConvId(e.id);
            else if (e.type === 'text_delta') upsertText(assistantId, 'assistant', e.delta);
            else if (e.type === 'tool_result') {
              upsertTool({
                id: e.id, name: e.name, preview: tool.preview, args: tool.args,
                status: e.ok ? 'ok' : 'error',
                resultSummary: summarizeResult(e.name, e.result),
                errorMessage: e.error,
              });
            }
          },
        });
      } catch (err: any) {
        upsertText(`local-stream-err-${Date.now()}`, 'assistant', localContinuationFailureMessage(tool, ok, err?.message ?? 'unknown error'));
      } finally {
        stopFlush();
        stopStreamRef.current = null;
        setIsStreaming(false);
        setStreamingMsgId(null);
      }
    },
    [accountUserId, aiModel, setConvId, startFlush, stopFlush, upsertText, upsertTool],
  );

  const navigateFn = useCallback((screen: string) => {
    // v1 navigation surface. Secondary routes are still defined in the app
    // but hidden from AI navigation per `lib/featureFlags.ts`.
    const routeMap: Record<string, string> = {
      discover: '/(tabs)/home',
      profile: '/(tabs)/you',
      search: '/(tabs)/explore',
      'create-post': '/create-post',
      messages: '/messages',
      bookmarks: '/bookmarks',
      notifications: '/notifications',
    };
    router.push((routeMap[screen] ?? '/(tabs)/home') as Href);
  }, [router]);

  const draftFn = useCallback((prompt: string, response: string) => {
    router.push({
      pathname: '/create-post',
      params: { prefillTitle: prompt, prefillBody: response },
    });
  }, [router]);

  const localToolContext = useMemo<LocalToolContext>(
    () => ({ navigateFn, draftFn }),
    [navigateFn, draftFn],
  );

  const runLocalTool = useCallback(
    async (tool: ToolCallItem) => {
      if (!isLocalTool(tool.name)) return;
      await runLocalToolFlow(tool, {
        upsertTool,
        appendAssistantText: (text) => upsertText(`local-err-${Date.now()}`, 'assistant', text),
        continueWithLocalResult,
      }, localToolContext);
    },
    [continueWithLocalResult, localToolContext, upsertText, upsertTool],
  );

  const runStream = useCallback(
    async (opts: Parameters<typeof streamEchoAI>[0]) => {
      const assistantId = `a-${Date.now()}`;
      setStreamingMsgId(assistantId);
      setIsStreaming(true);
      startFlush();
      let bufferedText = '';
      try {
        await streamEchoAI({
          ...opts,
          preferredModel: aiModel,
          personaContext: opts.personaContext ?? buildPersonaPromptContext(loadPersonaProfile(accountUserId)),
          onAbortHandle: (stop) => { stopStreamRef.current = stop; },
          onEvent: (e) => {
            if (e.type === 'conversation') setConvId(e.id);
            else if (e.type === 'text_delta') {
              if (streamResponsesRef.current) {
                upsertText(assistantId, 'assistant', e.delta);
              } else {
                bufferedText += e.delta;
              }
            }
            else if (e.type === 'tool_call_pending') {
              const tool: ToolCallItem = {
                id: e.id, name: e.name, preview: e.preview, args: e.args,
                status: 'pending_confirm', requiresConfirm: e.requiresConfirm,
              };
              upsertTool(tool);
              if (e.requiresConfirm === false && isLocalTool(e.name)) runLocalTool(tool);
            } else if (e.type === 'tool_result') {
              upsertTool({
                id: e.id, name: e.name, preview: '', args: undefined,
                status: e.ok ? 'ok' : 'error',
                resultSummary: summarizeResult(e.name, e.result),
                errorMessage: e.error,
              });
            }
            opts.onEvent?.(e);
          },
        });
        // If non-streaming mode, flush the full buffer at once now
        if (!streamResponsesRef.current && bufferedText) {
          upsertText(assistantId, 'assistant', bufferedText);
        }
        // Update session metadata once stream finishes.
        if (currentSessionId) {
          const final = useAppStore.getState().messagesBySession[currentSessionId] || [];
          const last = final[final.length - 1];
          if (last) updateSessionLastMessage(currentSessionId, last.content.slice(0, 80), final.length);
        }
      } catch (err: any) {
        if (isRateLimitError(err?.message)) {
          upsertText(
            `err-${Date.now()}`,
            'assistant',
            "You've reached your current Echo tier's AI limit. Try again when the window resets, or open Tiers for more capacity.",
          );
          track('chat_rate_limited');
        } else {
          upsertText(`err-${Date.now()}`, 'assistant', `Error: ${err?.message ?? 'unknown'}`);
        }
      } finally {
        stopFlush();
        stopStreamRef.current = null;
        setIsStreaming(false);
        setStreamingMsgId(null);
      }
    },
    [accountUserId, aiModel, currentSessionId, runLocalTool, setConvId, startFlush, stopFlush, updateSessionLastMessage, upsertText, upsertTool],
  );

  const handleStop = useCallback(() => {
    stopStreamRef.current?.();
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!currentSessionId) return;
      const userId = `u-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const isFirst = (useAppStore.getState().messagesBySession[currentSessionId] || []).length === 0;
      track('chat_message_sent', { is_first_in_session: isFirst, length: text.length, model: aiModel });
      // First message sent — dismiss the verbose "Best first chat" hint
      // panel for good. Suggestion chips remain useful for re-entry.
      if (!useAppStore.getState().hasSeenChatEmptyHint) {
        useAppStore.getState().setHasSeenChatEmptyHint(true);
      }
      addMessage(currentSessionId, { id: userId, role: 'user', content: text, createdAt });
      playSoundEffect('send');
      if (personaLearningEnabled && loadPersonaProfile(accountUserId).enabled) recordPersonaSignal(text, createdAt, accountUserId);
      runStream({
        message: text,
        conversationId: conversationIdRef.current ?? undefined,
        currentScreen: pathname,
        onEvent: () => {},
      });
      // Auto-title on first user turn (best-effort, non-blocking).
      if (isFirst) {
        setTimeout(() => {
          generateSessionTitle(text, aiModel)
            .then((title) => {
              if (!title) return;
              const stillExists = useAppStore.getState().sessions.some(s => s.id === currentSessionId);
              if (stillExists) updateSessionTitle(currentSessionId, title);
            })
            .catch(() => {});
        }, 1500);
      }
    },
    [accountUserId, aiModel, addMessage, currentSessionId, pathname, personaLearningEnabled, runStream, updateSessionTitle],
  );

  const handleConfirm = useCallback(
    async (tool: ToolCallItem) => {
      if (isLocalTool(tool.name)) { runLocalTool(tool); return; }
      upsertTool({ ...tool, status: 'running' });
      runStream({
        conversationId: conversationIdRef.current ?? undefined,
        confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve: true },
        onEvent: () => {},
      });
    },
    [runLocalTool, runStream, upsertTool],
  );

  const handleReject = useCallback(
    (tool: ToolCallItem) => {
      upsertTool({ ...tool, status: 'rejected' });
      runStream({
        conversationId: conversationIdRef.current ?? undefined,
        confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve: false },
        onEvent: () => {},
      });
    },
    [runStream, upsertTool],
  );

  const handleNewChat = useCallback(() => {
    setToolItems({});
    createSession();
  }, [createSession]);

  // Edit / Regenerate / Branch
  const regenerateAfter = useCallback((priorUserMsg: ChatMessage) => {
    if (!currentSessionId) return;
    truncateMessagesAfter(currentSessionId, priorUserMsg.id, false);
    setToolItems({});
    runStream({
      message: priorUserMsg.content,
      conversationId: conversationIdRef.current ?? undefined,
      onEvent: () => {},
    });
  }, [currentSessionId, runStream, truncateMessagesAfter]);

  const handleRegenerate = useCallback((m: Message) => {
    if (!currentSessionId) return;
    const all = useAppStore.getState().messagesBySession[currentSessionId] || [];
    const idx = all.findIndex(x => x.id === m.id);
    if (idx <= 0) return;
    let priorUser: ChatMessage | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (all[i].role === 'user') { priorUser = all[i]; break; }
    }
    if (!priorUser) return;
    regenerateAfter(priorUser);
  }, [currentSessionId, regenerateAfter]);

  const handleEdit = useCallback((m: Message) => {
    if (!currentSessionId) return;
    setEditTarget(m);
  }, [currentSessionId]);

  const handleEditSubmit = useCallback((text: string) => {
    if (!currentSessionId || !editTarget) return;
    truncateMessagesAfter(currentSessionId, editTarget.id, true);
    setToolItems({});
    const userId = `u-${Date.now()}`;
    const createdAt = new Date().toISOString();
    addMessage(currentSessionId, { id: userId, role: 'user', content: text, createdAt });
    if (personaLearningEnabled && loadPersonaProfile(accountUserId).enabled) recordPersonaSignal(text, createdAt, accountUserId);
    runStream({ message: text, conversationId: conversationIdRef.current ?? undefined, onEvent: () => {} });
    setEditTarget(null);
  }, [accountUserId, addMessage, currentSessionId, editTarget, personaLearningEnabled, runStream, truncateMessagesAfter]);

  const handleBranch = useCallback((m: Message) => {
    if (!currentSessionId) return;
    setToolItems({});
    branchSession(currentSessionId, m.id);
    conversationIdRef.current = null;
  }, [branchSession, currentSessionId]);

  const handleSelectSession = useCallback((id: string) => {
    setToolItems({});
    setCurrentSessionId(id);
  }, [setCurrentSessionId]);

  const handleShare = useCallback(() => {
    const userMsgs = messages.filter(m => m.role === 'user');
    const aiMsgs = messages.filter(m => m.role === 'assistant');
    if (userMsgs.length === 0 || aiMsgs.length === 0) {
      Alert.alert('Nothing to share', 'Have a conversation first, then share it.');
      return;
    }
    const lastUser = userMsgs[userMsgs.length - 1];
    const lastAi = aiMsgs[aiMsgs.length - 1];
    // Stash the full conversation history so the share screen can persist it
    // with the echo (powers remixing + better embeddings). URL params only
    // carry the last exchange for back-compat with thread-based share entry.
    // Preserve any pre-staged context (e.g. parentEchoId set by the remix
    // entry screen) so the lineage isn't lost when the user finally publishes.
    const existing = peekPendingPublishContext();
    setPendingPublishContext({
      ...(existing ?? {}),
      sourceConversationId: conversationIdRef.current ?? undefined,
      conversationSnapshot: messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });
    track('echo_drafted', {
      source: 'chat_share_nudge',
      length_prompt: lastUser.content.length,
      length_response: lastAi.content.length,
    });
    router.push({ pathname: '/share', params: { prompt: lastUser.content, response: lastAi.content } });
  }, [messages, router]);

  const headerHeight = insets.top + (layout.isDesktop ? 92 : 92);
  const showEmptySuggestions = items.length === 0;
  // Hide the onboarding panel after the first sent message.
  const showFirstChatPanel = showEmptySuggestions && !hasSeenChatEmptyHint;
  const showShareNudge = !isStreaming && messages.some(m => m.role === 'user') && messages.some(m => m.role === 'assistant');

  const emptyChatState = showEmptySuggestions ? (
    <ChatEmptyLaunchpad
      targetLabel={targetCategory.label}
      targetOutcome={targetOutcome}
      targetAppIds={targetMiniApps.length ? targetMiniApps : targetCategory.apps}
      onPrompt={setDraft}
      showPrivacy={showFirstChatPanel}
    />
  ) : null;

  // modelActions previously rendered via generic ActionSheet — replaced
  // by ModelPickerSheet (richer rows with icons + taglines + active state).

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {/* DM Inbox (shown when chatMode === 'dm') */}
      {chatMode === 'dm' && (
        <DMInboxView topPad={headerHeight} />
      )}

      {/* AI Chat (shown when chatMode === 'ai') */}
      <KeyboardAvoidingView
        style={{ flex: 1, display: chatMode === 'ai' ? 'flex' : 'none' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <FlashList
            ref={listRef as any}
            data={items}
            extraData={extraData}
            keyExtractor={(item) => item.kind === 'text' ? `t-${item.message.id}` : `c-${item.tool.id}`}
            renderItem={({ item }) =>
              (
                <View style={layout.contentStyle}>
                  {item.kind === 'text' ? (
                    <MessageBubble
                      message={item.message}
                      isStreaming={item.isStreaming}
                      onEdit={handleEdit}
                      onRegenerate={handleRegenerate}
                      onBranch={handleBranch}
                    />
                  ) : (
                    <ToolCallCard item={item.tool} onConfirm={handleConfirm} onReject={handleReject} />
                  )}
                </View>
              )
            }
            contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: layout.isDesktop ? 20 : 10 }}
            ListEmptyComponent={emptyChatState}
            onContentSizeChange={() => {
              listRef.current?.scrollToEnd({ animated: false });
            }}
          />
          {isStreaming && showTyping && <TypingIndicator />}
        </View>
        <View style={{ paddingBottom: layout.bottomChromePadding, backgroundColor: colors.bg }}>
          {showShareNudge ? (
            <Animated.View
              entering={animation(FadeIn.duration(200))}
              style={[layout.contentStyle, { paddingHorizontal: layout.gutter, paddingBottom: 8 }]}
            >
              <AnimatedPressable
                onPress={handleShare}
                haptic="medium"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 14,
                  backgroundColor: colors.accent,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  shadowColor: colors.accent,
                  shadowOpacity: 0.35,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0 }}>
                    Draft ready
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 }}>
                    Turn this conversation into an Echo.
                  </Text>
                </View>
                <ArrowUpRight color="#fff" size={18} weight="bold" />
              </AnimatedPressable>
            </Animated.View>
          ) : null}
          <View style={[layout.contentStyle, { paddingHorizontal: layout.isDesktop ? layout.gutter : 0 }]}>
            <ChatInput
              onSend={handleSend}
              isLoading={isStreaming}
              onStop={handleStop}
              draft={draft}
              onDraftChange={setDraft}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: headerHeight, overflow: 'hidden', zIndex: 10,
        }}
      >
        {useBlurHeader ? (
          <BlurView intensity={78} tint={tint} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: useBlurHeader ? 0.55 : 0.98 }]} />
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingTop: insets.top + 6,
            height: headerHeight,
            paddingHorizontal: layout.gutter,
            paddingBottom: 7,
            gap: 7,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold', lineHeight: 26 }} numberOfLines={1}>
                {chatMode === 'ai' ? 'Echo Chat' : 'Messages'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium' }} numberOfLines={1}>
                {chatMode === 'ai' ? `${modelLabel(aiModel)} · ${messages.length} message${messages.length === 1 ? '' : 's'}` : 'Private conversations'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {chatMode === 'ai' ? (
                <>
                  <HeaderIconButton icon={<List color={colors.textSecondary} size={18} />} label="Chat sessions" onPress={() => setDrawerOpen(true)} />
                  <HeaderIconButton icon={<Plus color={colors.textSecondary} size={18} />} label="New AI chat" onPress={handleNewChat} />
                  <HeaderIconButton icon={<Question color={colors.textSecondary} size={18} />} label="Quick actions" onPress={() => setShowActionCenter(true)} />
                  <HeaderIconButton icon={<ShareNetwork color="#fff" size={18} />} label="Share conversation" onPress={handleShare} accent />
                </>
              ) : (
                <HeaderIconButton icon={<PencilSimple color="#fff" size={18} />} label="Open full messages" onPress={() => router.push('/messages' as Href)} accent />
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <ModeSwitch mode={chatMode} onChange={setChatMode} />
            </View>
            {chatMode === 'ai' ? (
              <Pressable
                onPress={() => setModelSheetOpen(true)}
                style={{
                  minHeight: 38,
                  width: layout.isPhone ? 46 : undefined,
                  borderRadius: 999,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  paddingHorizontal: layout.isPhone ? 0 : 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Lightning color={colors.accent} size={14} weight="fill" />
                {!layout.isPhone ? (
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{modelLabel(aiModel)}</Text>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.glassBorder }} />
      </View>

      {/* First-run command palette tooltip */}
      {showHint && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={{
            position: 'absolute',
            bottom: insets.bottom + 92,
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: colors.isDark ? 'rgba(0,0,0,0.85)' : 'rgba(20,20,30,0.92)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            zIndex: 20,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Tip · long-press the Chat tab to open quick actions</Text>
        </Animated.View>
      )}

      <ActionCenter visible={showActionCenter} onClose={() => setShowActionCenter(false)} onSelectExample={setDraft} />
      <SessionsDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
      />
      <EditMessageModal
        visible={!!editTarget}
        initialValue={editTarget?.content ?? ''}
        onCancel={() => setEditTarget(null)}
        onSubmit={handleEditSubmit}
      />
      <ModelPickerSheet
        visible={modelSheetOpen}
        onClose={() => setModelSheetOpen(false)}
        selected={aiModel}
        onSelect={setAiModel}
      />
    </View>
  );
}

function summarizeResult(name: string, result: any): string {
  if (!result) return 'Done';
  switch (name) {
    case 'create_note': return `Created "${result.title ?? 'note'}"`;
    case 'update_note': return `Updated "${result.title ?? 'note'}"`;
    case 'create_habit': return `Created "${result.name ?? 'habit'}"`;
    case 'complete_habit': return `Completed "${result.name ?? 'habit'}"`;
    case 'uncomplete_habit': return `Uncompleted "${result.name ?? 'habit'}"`;
    case 'log_expense_transaction': return `Logged ${result.type ?? 'transaction'}`;
    case 'rename_voice_memo': return `Renamed "${result.title ?? 'voice memo'}"`;
    case 'delete_voice_memo': return `Deleted "${result.title ?? 'voice memo'}"`;
    case 'compose_post': return `Posted "${result.title ?? ''}"`;
    case 'compose_poll': return `Posted poll "${(result.question ?? '').slice(0, 60)}" · ${Array.isArray(result.options) ? result.options.length : 0} options`;
    case 'search_feed':
    case 'summarize_feed': return `${Array.isArray(result) ? result.length : 0} posts`;
    case 'find_user': return `${Array.isArray(result) ? result.length : 0} matches`;
    case 'list_my_followers': return `${Array.isArray(result) ? result.length : 0} followers`;
    case 'update_profile': return `Updated ${result.updated?.join(', ') ?? ''}`;
    default: return 'Done';
  }
}
