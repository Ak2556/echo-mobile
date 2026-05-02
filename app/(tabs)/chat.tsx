import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageBubble, Message } from '../../components/ai/MessageBubble';
import { ChatInput } from '../../components/ai/ChatInput';
import { ActionCenter } from '../../components/ai/ActionCenter';
import { ToolCallCard, ToolCallItem } from '../../components/ai/ToolCallCard';
import { TypingIndicator } from '../../components/ui/TypingIndicator';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { streamEchoAI } from '../../lib/api';
import { isLocalTool } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ShareNetwork, Plus, Lightning, Clock, Question } from 'phosphor-react-native';

const CONVERSATION_KEY = 'echo-ai/last-conversation-id';
const EMPTY_SUGGESTIONS = ['Ask for a better hook', 'Turn an idea into a post', 'Summarize a note', 'Find a conversation starter'];

type ChatItem =
  | { kind: 'text'; message: Message }
  | { kind: 'tool'; tool: ToolCallItem };

export default function ChatScreen() {
  const router = useRouter();
  const { colors, animation, reduceAnimations } = useTheme();
  const showTyping = useAppStore(s => s.showTypingIndicator);
  const aiModel = useAppStore(s => s.aiModel);
  const insets = useSafeAreaInsets();
  const useBlurHeader = Platform.OS === 'ios' && !reduceAnimations;
  const tint = colors.isDark ? 'dark' : 'extraLight';

  const [items, setItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showActionCenter, setShowActionCenter] = useState(false);
  const [draft, setDraft] = useState('');
  const [, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const listRef = useRef<any>(null);

  // Restore last conversation id on mount.
  useEffect(() => {
    AsyncStorage.getItem(CONVERSATION_KEY).then(id => {
      if (id) {
        setConversationId(id);
        conversationIdRef.current = id;
      }
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      setItems([
        {
          kind: 'text',
            message: {
              id: 'welcome',
              role: 'assistant',
              content: "I’m Echo. Ask something real, refine the strongest answer, and share the part worth publishing.",
            },
          },
        ]);
    }
  }, [items.length]);

  const setConvId = (id: string) => {
    setConversationId(id);
    conversationIdRef.current = id;
    AsyncStorage.setItem(CONVERSATION_KEY, id).catch(() => {});
  };

  const upsertText = (id: string, role: 'user' | 'assistant', delta: string) => {
    setItems(prev => {
      const idx = prev.findIndex(
        i => i.kind === 'text' && i.message.id === id,
      );
      if (idx >= 0) {
        const next = prev.slice();
        const existing = next[idx] as Extract<ChatItem, { kind: 'text' }>;
        next[idx] = {
          kind: 'text',
          message: { ...existing.message, content: existing.message.content + delta },
        };
        return next;
      }
      return [
        ...prev.filter(i => !(i.kind === 'text' && i.message.id === 'welcome')),
        { kind: 'text', message: { id, role, content: delta } },
      ];
    });
  };

  const upsertTool = (tool: ToolCallItem) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.kind === 'tool' && i.tool.id === tool.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { kind: 'tool', tool };
        return next;
      }
      return [...prev, { kind: 'tool', tool }];
    });
  };

  const continueWithLocalResult = useCallback(
    async (tool: ToolCallItem, ok: boolean, result?: any, error?: string) => {
      const assistantId = `a-${Date.now()}`;
      setIsStreaming(true);
      try {
        await streamEchoAI({
          preferredModel: aiModel,
          conversationId: conversationIdRef.current ?? undefined,
          localResult: {
            tool_call_id: tool.id,
            tool_name: tool.name,
            args: tool.args,
            ok,
            result,
            error,
          },
          onEvent: (e) => {
            if (e.type === 'conversation') {
              setConvId(e.id);
            } else if (e.type === 'text_delta') {
              upsertText(assistantId, 'assistant', e.delta);
            } else if (e.type === 'tool_result') {
              upsertTool({
                id: e.id,
                name: e.name,
                preview: tool.preview,
                args: tool.args,
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
    [aiModel],
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
    [continueWithLocalResult],
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
            if (e.type === 'conversation') {
              setConvId(e.id);
            } else if (e.type === 'text_delta') {
              upsertText(assistantId, 'assistant', e.delta);
            } else if (e.type === 'tool_call_pending') {
              const tool: ToolCallItem = {
                id: e.id,
                name: e.name,
                preview: e.preview,
                args: e.args,
                status: 'pending_confirm',
                requiresConfirm: e.requiresConfirm,
              };
              upsertTool(tool);
              if (e.requiresConfirm === false && isLocalTool(e.name)) {
                runLocalTool(tool);
              }
            } else if (e.type === 'tool_result') {
              upsertTool({
                id: e.id,
                name: e.name,
                preview: '',
                args: undefined,
                status: e.ok ? 'ok' : 'error',
                resultSummary: summarizeResult(e.name, e.result),
                errorMessage: e.error,
              });
            }
            // forward to caller's onEvent if they passed one
            opts.onEvent?.(e);
          },
        });
      } catch (err: any) {
        upsertText(`err-${Date.now()}`, 'assistant', `Error: ${err?.message ?? 'unknown'}`);
      } finally {
        setIsStreaming(false);
      }
    },
    [aiModel, runLocalTool],
  );

  const handleSend = useCallback(
    (text: string) => {
      const userId = `u-${Date.now()}`;
      setItems(prev => [
        ...prev.filter(i => !(i.kind === 'text' && i.message.id === 'welcome')),
        { kind: 'text', message: { id: userId, role: 'user', content: text } },
      ]);
      runStream({
        message: text,
        conversationId: conversationIdRef.current ?? undefined,
        onEvent: () => {},
      });
    },
    [runStream],
  );

  const handleConfirm = useCallback(
    async (tool: ToolCallItem) => {
      if (isLocalTool(tool.name)) {
        runLocalTool(tool);
        return;
      }

      // Mark as running locally while server executes.
      upsertTool({ ...tool, status: 'running' });
      runStream({
        conversationId: conversationIdRef.current ?? undefined,
        confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve: true },
        onEvent: () => {},
      });
    },
    [runLocalTool, runStream],
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
    [runStream],
  );

  const handleNewChat = () => {
    AsyncStorage.removeItem(CONVERSATION_KEY).catch(() => {});
    setConversationId(null);
    conversationIdRef.current = null;
    setItems([
      {
        kind: 'text',
        message: { id: 'welcome', role: 'assistant', content: "New chat. What's on your mind?" },
      },
    ]);
  };

  const handleShare = () => {
    const userMsgs = items.filter((i): i is Extract<ChatItem, { kind: 'text' }> => i.kind === 'text' && i.message.role === 'user');
    const aiMsgs = items.filter((i): i is Extract<ChatItem, { kind: 'text' }> => i.kind === 'text' && i.message.role === 'assistant' && i.message.id !== 'welcome');
    if (userMsgs.length === 0 || aiMsgs.length === 0) {
      Alert.alert('Nothing to share', 'Have a conversation first, then share it.');
      return;
    }
    const lastUser = userMsgs[userMsgs.length - 1].message;
    const lastAi = aiMsgs[aiMsgs.length - 1].message;
    router.push({
      pathname: '/share',
      params: { prompt: lastUser.content, response: lastAi.content },
    });
  };

  const headerHeight = insets.top + 52;
  const showEmptySuggestions = items.length === 1 && items[0]?.kind === 'text' && items[0].message.id === 'welcome';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Ambient gradient bg */}
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
            keyExtractor={(item) =>
              item.kind === 'text' ? `t-${item.message.id}` : `c-${item.tool.id}`
            }
            renderItem={({ item }) =>
              item.kind === 'text' ? (
                <MessageBubble message={item.message} />
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
          <ChatInput onSend={handleSend} isLoading={isStreaming} draft={draft} onDraftChange={setDraft} />
        </View>
      </KeyboardAvoidingView>

      {/* Glass header — always fully blurred (chat doesn't need scroll-reactive since messages start at bottom) */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {useBlurHeader ? (
          <BlurView
            intensity={70}
            tint={tint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bg,
              opacity: useBlurHeader ? 0.28 : 0.96,
            },
          ]}
        />

        {/* Header content */}
        <Animated.View
          entering={animation(FadeIn.duration(80))}
          style={{
            paddingTop: insets.top,
            height: headerHeight,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingBottom: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AnimatedPressable
              onPress={() => router.push('/(tabs)/history')}
              style={{
                padding: 6,
                borderRadius: 10,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              scaleValue={0.88}
              haptic="light"
            >
              <Clock color={colors.textSecondary} size={20} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={handleNewChat}
              style={{
                padding: 6,
                borderRadius: 10,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              scaleValue={0.88}
              haptic="light"
            >
              <Plus color={colors.textSecondary} size={20} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setShowActionCenter(true)}
              style={{
                padding: 6,
                borderRadius: 10,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              scaleValue={0.88}
              haptic="light"
            >
              <Question color={colors.textSecondary} size={20} />
            </AnimatedPressable>
          </View>

          {/* Centered title */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              paddingTop: insets.top,
              gap: 6,
            }}
            pointerEvents="none"
          >
            <Lightning color={colors.accent} size={18} weight="fill" />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Echo</Text>
          </View>

          <AnimatedPressable
            onPress={handleShare}
            style={{
              padding: 6,
              borderRadius: 10,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              zIndex: 1,
            }}
            scaleValue={0.88}
            haptic="light"
          >
            <ShareNetwork color={colors.textSecondary} size={20} />
          </AnimatedPressable>
        </Animated.View>

        {/* Bottom border */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.glassBorder,
          }}
        />
      </View>
      <ActionCenter visible={showActionCenter} onClose={() => setShowActionCenter(false)} onSelectExample={setDraft} />
    </View>
  );
}

// Compact human-readable summary of a tool's result for the card subtitle.
function summarizeResult(name: string, result: any): string {
  if (!result) return 'Done';
  switch (name) {
    case 'create_note':
      return `Created "${result.title ?? 'note'}"`;
    case 'update_note':
      return `Updated "${result.title ?? 'note'}"`;
    case 'create_habit':
      return `Created "${result.name ?? 'habit'}"`;
    case 'complete_habit':
      return `Completed "${result.name ?? 'habit'}"`;
    case 'uncomplete_habit':
      return `Uncompleted "${result.name ?? 'habit'}"`;
    case 'log_expense_transaction':
      return `Logged ${result.type ?? 'transaction'}`;
    case 'rename_voice_memo':
      return `Renamed "${result.title ?? 'voice memo'}"`;
    case 'delete_voice_memo':
      return `Deleted "${result.title ?? 'voice memo'}"`;
    case 'compose_post':
      return `Posted "${result.title ?? ''}"`;
    case 'search_feed':
    case 'summarize_feed':
      return `${Array.isArray(result) ? result.length : 0} posts`;
    case 'find_user':
      return `${Array.isArray(result) ? result.length : 0} matches`;
    case 'list_my_followers':
      return `${Array.isArray(result) ? result.length : 0} followers`;
    case 'update_profile':
      return `Updated ${result.updated?.join(', ') ?? ''}`;
    default:
      return result.ok ? 'Done' : 'Done';
  }
}
