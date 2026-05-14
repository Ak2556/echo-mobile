import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { streamEchoAI } from '../../lib/api';
import { isLocalTool } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { generateSessionTitle } from '../../lib/aiTitle';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ShareNetwork, Plus, Lightning, List, Question, ArrowUpRight } from 'phosphor-react-native';
import { ChatMessage } from '../../types';

const EMPTY_SUGGESTIONS = ['Ask for a better hook', 'Turn an idea into a post', 'Run a poll for me', 'Summarize a note'];

type ChatItem =
  | { kind: 'text'; message: Message }
  | { kind: 'tool'; tool: ToolCallItem };

export default function ChatScreen() {
  const router = useRouter();
  const { colors, animation, reduceAnimations } = useTheme();
  const showTyping = useAppStore(s => s.showTypingIndicator);
  const aiModel = useAppStore(s => s.aiModel);
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
  const insets = useSafeAreaInsets();
  const useBlurHeader = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  // Ephemeral live items: persisted text messages + transient tool cards.
  const [toolItems, setToolItems] = useState<Record<string, ToolCallItem>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [showActionCenter, setShowActionCenter] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const listRef = useRef<any>(null);

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
    }));
    const tools: ChatItem[] = Object.values(toolItems).map(t => ({ kind: 'tool', tool: t }));
    return [...textItems, ...tools];
  }, [messages, toolItems]);

  const setConvId = useCallback((id: string) => {
    if (currentSessionId) setSessionConversationId(currentSessionId, id);
    conversationIdRef.current = id;
  }, [currentSessionId, setSessionConversationId]);

  const upsertText = useCallback((id: string, role: 'user' | 'assistant', delta: string) => {
    if (!currentSessionId) return;
    const existing = (useAppStore.getState().messagesBySession[currentSessionId] || []).find(m => m.id === id);
    if (existing) {
      updateMessage(currentSessionId, id, existing.content + delta);
    } else {
      addMessage(currentSessionId, { id, role, content: delta, createdAt: new Date().toISOString() });
    }
  }, [currentSessionId, addMessage, updateMessage]);

  const upsertTool = useCallback((tool: ToolCallItem) => {
    setToolItems(prev => ({ ...prev, [tool.id]: tool }));
  }, []);

  const continueWithLocalResult = useCallback(
    async (tool: ToolCallItem, ok: boolean, result?: any, error?: string) => {
      const assistantId = `a-${Date.now()}`;
      setIsStreaming(true);
      try {
        await streamEchoAI({
          preferredModel: aiModel,
          conversationId: conversationIdRef.current ?? undefined,
          localResult: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, ok, result, error },
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
        setIsStreaming(false);
      }
    },
    [aiModel, setConvId, upsertText, upsertTool],
  );

  const runLocalTool = useCallback(
    async (tool: ToolCallItem) => {
      if (!isLocalTool(tool.name)) return;
      await runLocalToolFlow(tool, {
        upsertTool,
        appendAssistantText: (text) => upsertText(`local-err-${Date.now()}`, 'assistant', text),
        continueWithLocalResult,
      });
    },
    [continueWithLocalResult, upsertText, upsertTool],
  );

  const runStream = useCallback(
    async (opts: Parameters<typeof streamEchoAI>[0]) => {
      const assistantId = `a-${Date.now()}`;
      setIsStreaming(true);
      try {
        await streamEchoAI({
          ...opts,
          preferredModel: aiModel,
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
        upsertText(`err-${Date.now()}`, 'assistant', `Error: ${err?.message ?? 'unknown'}`);
      } finally {
        setIsStreaming(false);
      }
    },
    [aiModel, currentSessionId, runLocalTool, setConvId, updateSessionLastMessage, upsertText, upsertTool],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!currentSessionId) return;
      const userId = `u-${Date.now()}`;
      const isFirst = (useAppStore.getState().messagesBySession[currentSessionId] || []).length === 0;
      addMessage(currentSessionId, { id: userId, role: 'user', content: text, createdAt: new Date().toISOString() });
      runStream({
        message: text,
        conversationId: conversationIdRef.current ?? undefined,
        onEvent: () => {},
      });
      // Auto-title on first user turn (best-effort, non-blocking).
      // Delay slightly so it doesn't compete with the primary reply stream.
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
    [aiModel, addMessage, currentSessionId, runStream, updateSessionTitle],
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

  // ── Edit / Regenerate / Branch ──────────────────────────
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
    // Find the last user message before this assistant response.
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
    addMessage(currentSessionId, { id: userId, role: 'user', content: text, createdAt: new Date().toISOString() });
    runStream({ message: text, conversationId: conversationIdRef.current ?? undefined, onEvent: () => {} });
    setEditTarget(null);
  }, [addMessage, currentSessionId, editTarget, runStream, truncateMessagesAfter]);

  const handleBranch = useCallback((m: Message) => {
    if (!currentSessionId) return;
    setToolItems({});
    branchSession(currentSessionId, m.id);
    // Reset server-side conversation for the branch — new session, fresh thread.
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
    router.push({ pathname: '/share', params: { prompt: lastUser.content, response: lastAi.content } });
  }, [messages, router]);

  const headerHeight = insets.top + 52;
  const showEmptySuggestions = items.length === 0;
  const showShareNudge = !isStreaming && messages.some(m => m.role === 'user') && messages.some(m => m.role === 'assistant');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient
        colors={colors.ambientGradient}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <FlashList
            ref={listRef as any}
            data={items}
            extraData={items.length}
            keyExtractor={(item) => item.kind === 'text' ? `t-${item.message.id}` : `c-${item.tool.id}`}
            renderItem={({ item }) =>
              item.kind === 'text' ? (
                <MessageBubble
                  message={item.message}
                  onEdit={handleEdit}
                  onRegenerate={handleRegenerate}
                  onBranch={handleBranch}
                />
              ) : (
                <ToolCallCard item={item.tool} onConfirm={handleConfirm} onReject={handleReject} />
              )
            }
            contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          {isStreaming && showTyping && <TypingIndicator />}
        </View>
        <View style={{ paddingBottom: 110 }}>
          {showEmptySuggestions ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 10 }}>
              <View style={{ borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 14 }}>
                <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>Best first chat</Text>
                <Text style={{ color: colors.textMuted, lineHeight: 19 }}>
                  Ask a question you could imagine posting later. The strongest Echoes start with a real prompt, not a generic demo.
                </Text>
              </View>
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
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{suggestion}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          ) : null}
          {showShareNudge ? (
            <Animated.View
              entering={animation(FadeIn.duration(200))}
              style={{ paddingHorizontal: 12, paddingBottom: 8 }}
            >
              <AnimatedPressable
                onPress={handleShare}
                depth="soft"
                haptic="light"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 999,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.accent,
                  backgroundColor: colors.isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                }}
              >
                <ArrowUpRight color={colors.accent} size={15} weight="bold" />
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Share as Echo</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : null}
          <ChatInput onSend={handleSend} isLoading={isStreaming} draft={draft} onDraftChange={setDraft} />
        </View>
      </KeyboardAvoidingView>

      {/* Glass header */}
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
            paddingTop: insets.top, height: headerHeight,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingBottom: 4,
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

          <View
            style={{
              position: 'absolute', left: 0, right: 0,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
              paddingTop: insets.top, gap: 6,
            }}
            pointerEvents="none"
          >
            <Lightning color={colors.accent} size={18} weight="fill" />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Echo</Text>
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
