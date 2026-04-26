import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageBubble, Message } from '../../components/ai/MessageBubble';
import { ChatInput } from '../../components/ai/ChatInput';
import { ToolCallCard, ToolCallItem } from '../../components/ai/ToolCallCard';
import { TypingIndicator } from '../../components/ui/TypingIndicator';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { streamEchoAI } from '../../lib/api';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { ShareNetwork, Plus, Lightning, Clock } from 'phosphor-react-native';

const CONVERSATION_KEY = 'echo-ai/last-conversation-id';

type ChatItem =
  | { kind: 'text'; message: Message }
  | { kind: 'tool'; tool: ToolCallItem };

export default function ChatScreen() {
  const router = useRouter();
  const { colors, animation } = useTheme();
  const showTyping = useAppStore(s => s.showTypingIndicator);

  const [items, setItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
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
            content: "Hello! I'm Echo. I can post for you, search the feed, follow people, edit your profile — just ask.",
          },
        },
      ]);
    }
  }, []);

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

  const runStream = useCallback(
    async (opts: Parameters<typeof streamEchoAI>[0]) => {
      const assistantId = `a-${Date.now()}`;
      setIsStreaming(true);
      try {
        await streamEchoAI({
          ...opts,
          onEvent: (e) => {
            if (e.type === 'conversation') {
              setConvId(e.id);
            } else if (e.type === 'text_delta') {
              upsertText(assistantId, 'assistant', e.delta);
            } else if (e.type === 'tool_call_pending') {
              upsertTool({
                id: e.id,
                name: e.name,
                preview: e.preview,
                args: e.args,
                status: 'pending_confirm',
              });
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
    [],
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
    (tool: ToolCallItem) => {
      // Mark as running locally while server executes.
      upsertTool({ ...tool, status: 'running' });
      runStream({
        conversationId: conversationIdRef.current ?? undefined,
        confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve: true },
        onEvent: () => {},
      });
    },
    [runStream],
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.View
        entering={animation(FadeIn.duration(80))}
        className="flex-row items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <View className="flex-row items-center gap-1.5">
          <AnimatedPressable
            onPress={() => router.push('/(tabs)/history')}
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: colors.surface }}
            scaleValue={0.88}
            haptic="light"
          >
            <Clock color={colors.textSecondary} size={20} />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={handleNewChat}
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: colors.surface }}
            scaleValue={0.88}
            haptic="light"
          >
            <Plus color={colors.textSecondary} size={20} />
          </AnimatedPressable>
        </View>
        <View className="flex-row items-center absolute left-0 right-0 justify-center pointer-events-none">
          <Lightning color={colors.accent} size={18} weight="fill" />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, marginLeft: 8 }}>
            Echo
          </Text>
        </View>
        <AnimatedPressable
          onPress={handleShare}
          className="p-1.5 rounded-lg z-10"
          style={{ backgroundColor: colors.surface }}
          scaleValue={0.88}
          haptic="light"
        >
          <ShareNetwork color={colors.textSecondary} size={20} />
        </AnimatedPressable>
      </Animated.View>

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
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          {isStreaming && showTyping && <TypingIndicator />}
        </View>
        <View style={{ paddingBottom: 110 }}>
          <ChatInput onSend={handleSend} isLoading={isStreaming} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Compact human-readable summary of a tool's result for the card subtitle.
function summarizeResult(name: string, result: any): string {
  if (!result) return 'Done';
  switch (name) {
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
