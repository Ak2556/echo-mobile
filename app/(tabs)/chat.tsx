import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, type Href } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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
import { streamEchoAI, EchoAIModel, isRateLimitError } from '../../lib/api';
import { isLocalTool, LocalToolContext } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { generateSessionTitle } from '../../lib/aiTitle';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ShareNetwork, Plus, Lightning, List, Question, ArrowUpRight, CaretDown } from 'phosphor-react-native';
import { ChatMessage } from '../../types';
import { peekPendingPublishContext, setPendingPublishContext } from '../../lib/publishContext';
import { track } from '../../lib/analytics';
import { useResponsiveLayout } from '../../lib/responsive';
import { buildPersonaPromptContext, loadPersonaProfile, recordPersonaSignal, syncPersonaFromMessages } from '../../lib/persona';

const EMPTY_SUGGESTIONS = [
  'A question I keep returning to',
  'Something I changed my mind about',
  'An idea I can\'t fully explain yet',
  'What I actually think about…',
];

const MODEL_LABELS: Record<EchoAIModel, string> = {
  'gemini-2.5-flash': 'Flash',
  'gemini-2.5-pro': 'Pro',
  'gemini-2.0-flash-lite': 'Lite',
};

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
  const personaLearningEnabled = useAppStore(s => s.personaLearningEnabled);
  const accountUserId = useAppStore(s => s.userId);
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const useBlurHeader = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

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
      try {
        await streamEchoAI({
          ...opts,
          preferredModel: aiModel,
          personaContext: opts.personaContext ?? buildPersonaPromptContext(loadPersonaProfile(accountUserId)),
          onAbortHandle: (stop) => { stopStreamRef.current = stop; },
          onEvent: (e) => {
            if (e.type === 'conversation') setConvId(e.id);
            else if (e.type === 'text_delta') upsertText(assistantId, 'assistant', e.delta);
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

  const headerHeight = insets.top + (layout.isDesktop ? 64 : 52);
  const showEmptySuggestions = items.length === 0;
  // Hide the onboarding panel after the first sent message.
  const showFirstChatPanel = showEmptySuggestions && !hasSeenChatEmptyHint;
  const showShareNudge = !isStreaming && messages.some(m => m.role === 'user') && messages.some(m => m.role === 'assistant');

  const emptyChatState = showEmptySuggestions ? (
    <View style={[layout.contentStyle, { paddingHorizontal: layout.gutter, paddingTop: layout.isDesktop ? 112 : 96, paddingBottom: 20, gap: 16 }]}>
      {showFirstChatPanel && (
        <View style={{
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.glassBorder,
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          padding: 18,
        }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>Start with something real</Text>
          <Text style={{ color: colors.textMuted, lineHeight: 20, fontSize: 14 }}>
            A half-formed thought, a question you can't shake, something you've been turning over. The clearest Echoes start there.
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 14, opacity: 0.8, lineHeight: 16 }}>
            Your messages here are sent to our AI providers to generate replies. Don&apos;t share private info you wouldn&apos;t want stored.
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMPTY_SUGGESTIONS.map(suggestion => (
          <AnimatedPressable
            key={suggestion}
            onPress={() => setDraft(suggestion)}
            depth="soft"
            fadeOnPress
            style={{
              borderRadius: 999,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.glassBorder,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{suggestion}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  ) : null;

  // modelActions previously rendered via generic ActionSheet — replaced
  // by ModelPickerSheet (richer rows with icons + taglines + active state).

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
            contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: layout.isDesktop ? 18 : 8 }}
            ListEmptyComponent={emptyChatState}
            onContentSizeChange={() => {
              listRef.current?.scrollToEnd({ animated: false });
            }}
          />
          {isStreaming && showTyping && <TypingIndicator />}
        </View>
        <View style={{ paddingBottom: layout.bottomChromePadding }}>
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
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0 }}>
                    Something landed here
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 }}>
                    Shape it into an Echo worth keeping.
                  </Text>
                </View>
                <ArrowUpRight color="#fff" size={18} weight="bold" />
              </AnimatedPressable>
            </Animated.View>
          ) : null}
          <View style={layout.contentStyle}>
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
          <BlurView intensity={70} tint={tint} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: useBlurHeader ? 0.28 : 0.96 }]} />
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingTop: insets.top + (layout.isDesktop ? 10 : 0), height: headerHeight,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: layout.gutter, paddingBottom: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AnimatedPressable
              onPress={() => setDrawerOpen(true)}
              style={{ padding: 6, borderRadius: 10, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              scaleValue={0.88}
              haptic="light"
              accessibilityLabel="Chat sessions"
              accessibilityRole="button"
            >
              <List color={colors.textSecondary} size={20} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={handleNewChat}
              style={{ padding: 6, borderRadius: 10, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              scaleValue={0.88}
              haptic="light"
              accessibilityLabel="New chat"
              accessibilityRole="button"
            >
              <Plus color={colors.textSecondary} size={20} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setShowActionCenter(true)}
              style={{ padding: 6, borderRadius: 10, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              scaleValue={0.88}
              haptic="light"
              accessibilityLabel="Quick actions"
              accessibilityRole="button"
            >
              <Question color={colors.textSecondary} size={20} />
            </AnimatedPressable>
          </View>

          {/* Center: Echo title + model pill */}
          <View
            style={{
              position: 'absolute', left: 0, right: 0,
              alignItems: 'center', paddingTop: insets.top,
            }}
            pointerEvents="box-none"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} pointerEvents="box-none">
              <Lightning color={colors.accent} size={16} weight="fill" />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Echo</Text>
              <AnimatedPressable
                onPress={() => setModelSheetOpen(true)}
                scaleValue={0.9}
                haptic="light"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: colors.surfaceHover,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                  {MODEL_LABELS[aiModel]}
                </Text>
                <CaretDown color={colors.textMuted} size={10} weight="bold" />
              </AnimatedPressable>
            </View>
          </View>

          <AnimatedPressable
            onPress={handleShare}
            style={{ padding: 6, borderRadius: 10, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', zIndex: 1 }}
            scaleValue={0.88}
            haptic="light"
            accessibilityLabel="Share conversation"
            accessibilityRole="button"
          >
            <ShareNetwork color={colors.textSecondary} size={20} />
          </AnimatedPressable>
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
