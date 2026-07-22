import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { ArrowSquareOut, Compass, NotePencil, Sparkle } from 'phosphor-react-native';
import { ChatInput } from '../ai/ChatInput';
import { MessageBubble } from '../ai/MessageBubble';
import { ToolCallCard, type ToolCallItem } from '../ai/ToolCallCard';
import { useTheme } from '../../lib/theme';
import { streamEchoAI } from '../../lib/api';
import { isLocalTool, type LocalToolContext } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { useAppStore } from '../../store/useAppStore';
import type { ChatMessage } from '../../types';
import { assistantLanguageInstruction } from '../../lib/languages';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function screenLabel(pathname: string): string {
  if (pathname.includes('mini-apps/pomodoro')) return 'Pomodoro';
  if (pathname.includes('mini-apps/expenses')) return 'Expenses';
  if (pathname.includes('mini-apps/notes')) return 'Notes';
  if (pathname.includes('mini-apps/tasks')) return 'Tasks';
  if (pathname.includes('mini-apps')) return 'Mini app';
  if (pathname.includes('messages') || pathname.includes('chat')) return 'Messages';
  if (pathname.includes('market')) return 'Market';
  if (pathname.includes('explore')) return 'Explore';
  if (pathname.includes('you') || pathname.includes('user') || pathname.includes('profile')) return 'Profile';
  return 'Home';
}

function startersForScreen(pathname: string, targetOutcome?: string | null): string[] {
  if (pathname.includes('mini-apps/expenses')) return ['Summarize spending this week', 'Log coffee $4.50', 'Find my biggest category'];
  if (pathname.includes('mini-apps/notes')) return ['Turn this into action steps', 'Create a note from this', 'Find related notes'];
  if (pathname.includes('mini-apps/tasks')) return ['Plan my next 3 tasks', 'Create a task checklist', 'What should I do first?'];
  if (pathname.includes('mini-apps/pomodoro')) return ['Set a focus intention', 'Make this session easier', 'Plan my next break'];
  if (pathname.includes('messages')) return ['Draft a warm reply', 'Summarize this thread', 'Help me say this better'];
  if (pathname.includes('market')) return ['Improve this listing', 'Price this fairly', 'Draft a buyer message'];
  if (pathname.includes('explore')) return ['Find ideas for me', 'Explain this trend', 'Turn this into a post'];
  if (pathname.includes('you') || pathname.includes('profile')) return ['Improve my profile', 'Draft my next Echo', 'Review my progress'];
  if (targetOutcome) return ['Move my target forward', 'What should I do next?', 'Create a progress note'];
  return ['Plan my next best action', 'Turn this into a clear Echo', 'Help me decide fast'];
}

function summarizeResult(name: string, result: any): string {
  if (name === 'search_local_productivity') return `${result?.results?.length ?? 0} results`;
  if (name === 'summarize_expenses') return `Income ${result?.income ?? 0} - expenses ${result?.expense ?? 0}`;
  if (name === 'get_today_productivity') return `${result?.habits?.done ?? 0}/${result?.habits?.total ?? 0} habits`;
  if (name === 'list_memory') return `${result?.items?.length ?? 0} memories`;
  return 'Done';
}

export default function FloatingEchoAgent() {
  const { colors, font } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const currentSessionId = useAppStore(s => s.currentSessionId);
  const messagesBySession = useAppStore(s => s.messagesBySession);
  const conversationIdBySession = useAppStore(s => s.conversationIdBySession);
  const aiModel = useAppStore(s => s.aiModel);
  const appLanguage = useAppStore(s => s.appLanguage);
  const targetOutcome = useAppStore(s => s.targetOutcome);
  const createSession = useAppStore(s => s.createSession);
  const setCurrentSessionId = useAppStore(s => s.setCurrentSessionId);
  const addMessage = useAppStore(s => s.addMessage);
  const updateMessage = useAppStore(s => s.updateMessage);
  const updateSessionLastMessage = useAppStore(s => s.updateSessionLastMessage);
  const setSessionConversationId = useAppStore(s => s.setSessionConversationId);
  const [sessionId, setSessionId] = useState<string | null>(currentSessionId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, ToolCallItem>>({});
  const stopRef = useRef<(() => void) | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentSessionId) {
      setSessionId(currentSessionId);
      return;
    }
    const id = createSession('Echo Agent');
    setSessionId(id);
  }, [createSession, currentSessionId]);

  useEffect(() => {
    conversationIdRef.current = sessionId ? (conversationIdBySession[sessionId] ?? null) : null;
  }, [conversationIdBySession, sessionId]);

  const messages = useMemo<ChatMessage[]>(() => {
    if (!sessionId) return [];
    return messagesBySession[sessionId] ?? [];
  }, [messagesBySession, sessionId]);
  const visibleTools = useMemo(() => Object.values(tools), [tools]);
  const screen = screenLabel(pathname);
  const starters = useMemo(() => startersForScreen(pathname, targetOutcome), [pathname, targetOutcome]);

  const personaContext = targetOutcome
    ? `The user is currently in ${screen} (${pathname}) and trying to achieve: ${targetOutcome}. Echo is floating above the app, so be quick, contextual, and willing to use local tools for notes, habits, expenses, productivity, navigation, drafting, and memory when useful. ${assistantLanguageInstruction(appLanguage)}`
    : `The user is currently in ${screen} (${pathname}). Echo is floating above the app, so be quick, contextual, and willing to use local tools for notes, habits, expenses, productivity, navigation, drafting, and memory when useful. ${assistantLanguageInstruction(appLanguage)}`;

  const finishSession = useCallback((id: string, fallback: string) => {
    const updated = useAppStore.getState().messagesBySession[id] ?? [];
    const last = [...updated].reverse().find(m => m.content.trim())?.content ?? fallback;
    updateSessionLastMessage(id, last.slice(0, 100), updated.length);
  }, [updateSessionLastMessage]);

  const setConvId = useCallback((id: string) => {
    conversationIdRef.current = id;
    if (sessionId) setSessionConversationId(sessionId, id);
  }, [sessionId, setSessionConversationId]);

  const upsertTool = useCallback((tool: ToolCallItem) => {
    setTools(prev => ({ ...prev, [tool.id]: tool }));
  }, []);

  const localToolContext = useMemo<LocalToolContext>(() => ({
    navigateFn: (screenName: string) => {
      const routeMap: Record<string, Href> = {
        discover: '/(tabs)/home',
        home: '/(tabs)/home',
        profile: '/(tabs)/you',
        search: '/(tabs)/explore',
        explore: '/(tabs)/explore',
        market: '/(tabs)/marketplace',
        marketplace: '/(tabs)/marketplace',
        messages: '/messages',
        chat: '/(tabs)/chat',
        tools: '/(tabs)/apps',
        apps: '/(tabs)/apps',
        settings: '/settings',
        'create-post': '/create-post',
        compose: '/create-post',
      };
      router.push(routeMap[screenName] ?? '/(tabs)/home');
    },
    draftFn: (prompt: string, response: string) => {
      router.push({
        pathname: '/create-post',
        params: { prefillTitle: prompt, prefillBody: response },
      });
    },
  }), [router]);

  const appendAssistantMessage = useCallback((content: string) => {
    if (!sessionId) return;
    addMessage(sessionId, {
      id: makeId('a'),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    });
  }, [addMessage, sessionId]);

  const continueWithLocalResult = useCallback(
    async (tool: ToolCallItem, ok: boolean, result?: any, error?: string) => {
      if (!sessionId) return;
      const assistantId = makeId('a');
      addMessage(sessionId, { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() });
      let response = '';
      setStreamingId(assistantId);
      setIsStreaming(true);
      try {
        await streamEchoAI({
          preferredModel: aiModel,
          conversationId: conversationIdRef.current ?? undefined,
          currentScreen: pathname,
          personaContext,
          localResult: {
            tool_call_id: tool.id,
            tool_name: tool.name,
            args: tool.args,
            ok,
            result,
            error,
          },
          onAbortHandle: (stop) => { stopRef.current = stop; },
          onEvent: (event) => {
            if (event.type === 'conversation') setConvId(event.id);
            else if (event.type === 'text_delta') {
              response += event.delta;
              updateMessage(sessionId, assistantId, response);
            } else if (event.type === 'tool_result') {
              upsertTool({
                id: event.id,
                name: event.name,
                preview: tool.preview,
                args: tool.args,
                status: event.ok ? 'ok' : 'error',
                resultSummary: summarizeResult(event.name, event.result),
                errorMessage: event.error,
              });
            }
          },
        });
      } catch (err: any) {
        updateMessage(sessionId, assistantId, localContinuationFailureMessage(tool, ok, err?.message ?? 'unknown error'));
      } finally {
        stopRef.current = null;
        setIsStreaming(false);
        setStreamingId(null);
        finishSession(sessionId, tool.preview);
      }
    },
    [addMessage, aiModel, finishSession, pathname, personaContext, sessionId, setConvId, updateMessage, upsertTool],
  );

  const runLocalTool = useCallback(
    async (tool: ToolCallItem) => {
      if (!isLocalTool(tool.name)) return;
      await runLocalToolFlow(tool, {
        upsertTool,
        appendAssistantText: appendAssistantMessage,
        continueWithLocalResult,
      }, localToolContext);
    },
    [appendAssistantMessage, continueWithLocalResult, localToolContext, upsertTool],
  );

  const continueWithToolConfirmation = useCallback(
    async (tool: ToolCallItem, approve: boolean) => {
      if (!sessionId) return;
      const assistantId = makeId('a');
      addMessage(sessionId, { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() });
      let response = '';
      setStreamingId(assistantId);
      setIsStreaming(true);
      try {
        await streamEchoAI({
          preferredModel: aiModel,
          conversationId: conversationIdRef.current ?? undefined,
          currentScreen: pathname,
          personaContext,
          confirm: {
            tool_call_id: tool.id,
            tool_name: tool.name,
            args: tool.args,
            approve,
          },
          onAbortHandle: (stop) => { stopRef.current = stop; },
          onEvent: (event) => {
            if (event.type === 'conversation') setConvId(event.id);
            else if (event.type === 'text_delta') {
              response += event.delta;
              updateMessage(sessionId, assistantId, response);
            } else if (event.type === 'tool_result') {
              upsertTool({
                id: event.id,
                name: event.name,
                preview: tool.preview,
                args: tool.args,
                status: event.ok ? 'ok' : 'error',
                resultSummary: summarizeResult(event.name, event.result),
                errorMessage: event.error,
              });
            }
          },
        });
        if (!response.trim()) {
          updateMessage(sessionId, assistantId, approve ? 'Done.' : 'Cancelled.');
        }
      } catch (err: any) {
        updateMessage(sessionId, assistantId, err?.message ? `I could not continue: ${err.message}` : 'I could not continue.');
      } finally {
        stopRef.current = null;
        setIsStreaming(false);
        setStreamingId(null);
        finishSession(sessionId, tool.preview);
      }
    },
    [addMessage, aiModel, finishSession, pathname, personaContext, sessionId, setConvId, updateMessage, upsertTool],
  );

  const send = useCallback(async (text: string) => {
    if (!sessionId || isStreaming) return;
    setCurrentSessionId(sessionId);
    setTools({});

    const userMessage: ChatMessage = {
      id: makeId('u'),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantId = makeId('a');
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    addMessage(sessionId, userMessage);
    addMessage(sessionId, assistantMessage);
    setStreamingId(assistantId);
    setIsStreaming(true);

    let response = '';
    try {
      await streamEchoAI({
        message: text,
        preferredModel: aiModel,
        conversationId: conversationIdRef.current ?? undefined,
        currentScreen: pathname,
        personaContext,
        onAbortHandle: (stop) => { stopRef.current = stop; },
        onEvent: (event) => {
          if (event.type === 'conversation') setConvId(event.id);
          else if (event.type === 'text_delta') {
            response += event.delta;
            updateMessage(sessionId, assistantId, response);
          } else if (event.type === 'tool_call_pending') {
            const tool: ToolCallItem = {
              id: event.id,
              name: event.name,
              preview: event.preview,
              args: event.args,
              status: 'pending_confirm',
              requiresConfirm: event.requiresConfirm,
            };
            upsertTool(tool);
            if (event.requiresConfirm === false && isLocalTool(event.name)) runLocalTool(tool);
          } else if (event.type === 'tool_result') {
            upsertTool({
              id: event.id,
              name: event.name,
              preview: '',
              args: undefined,
              status: event.ok ? 'ok' : 'error',
              resultSummary: summarizeResult(event.name, event.result),
              errorMessage: event.error,
            });
          }
        },
      });
      if (!response.trim()) updateMessage(sessionId, assistantId, 'Stopped.');
    } catch (err: any) {
      updateMessage(
        sessionId,
        assistantId,
        err?.message ? `I could not connect: ${err.message}` : 'I could not connect. Try again in a moment.',
      );
    } finally {
      stopRef.current = null;
      setIsStreaming(false);
      setStreamingId(null);
      finishSession(sessionId, text);
    }
  }, [
    addMessage,
    aiModel,
    finishSession,
    isStreaming,
    pathname,
    personaContext,
    runLocalTool,
    sessionId,
    setConvId,
    setCurrentSessionId,
    updateMessage,
    upsertTool,
  ]);

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  const confirmTool = useCallback((tool: ToolCallItem) => {
    if (isLocalTool(tool.name)) {
      runLocalTool(tool);
      return;
    }
    upsertTool({ ...tool, status: 'running' });
    continueWithToolConfirmation(tool, true);
  }, [continueWithToolConfirmation, runLocalTool, upsertTool]);

  const rejectTool = useCallback((tool: ToolCallItem) => {
    upsertTool({ ...tool, status: 'rejected' });
    continueWithToolConfirmation(tool, false);
  }, [continueWithToolConfirmation, upsertTool]);

  const openFullChat = useCallback(() => {
    if (sessionId) setCurrentSessionId(sessionId);
    router.push('/(tabs)/chat');
  }, [router, sessionId, setCurrentSessionId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            backgroundColor: colors.surface,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkle color="#fff" size={21} weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font.display, { color: colors.text, fontSize: 22 }]}>Echo AI</Text>
              <Text style={[font.body, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                {screen} ready - fast actions
              </Text>
            </View>
            <Pressable
              onPress={openFullChat}
              accessibilityRole="button"
              accessibilityLabel="Open full Echo chat"
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceHover,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <ArrowSquareOut color={colors.textSecondary} size={18} weight="bold" />
            </Pressable>
          </View>

          {messages.length === 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {starters.map(prompt => (
                <Pressable
                  key={prompt}
                  onPress={() => send(prompt)}
                  accessibilityRole="button"
                  disabled={isStreaming}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: colors.accent + '18',
                    borderWidth: 1,
                    borderColor: colors.accent + '55',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={[font.bodySemibold, { color: colors.text, fontSize: 12 }]}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {messages.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 36 }}>
            <Text style={[font.bodySemibold, { color: colors.textSecondary, textAlign: 'center' }]}>
              Echo can work inside the app now.
            </Text>
            <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 280 }]}>
              Ask it to create notes, update habits, log expenses, search local progress, navigate, or draft an Echo.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={message.id === streamingId}
              />
            ))}
          </View>
        )}

        {visibleTools.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            {visibleTools.map(tool => (
              <ToolCallCard
                key={tool.id}
                item={tool}
                onConfirm={confirmTool}
                onReject={rejectTool}
              />
            ))}
          </View>
        ) : null}

        {messages.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 10 }}>
            <Pressable
              onPress={() => send(`Help me with what I am doing on ${screen}.`)}
              disabled={isStreaming}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 11,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Compass color={colors.accent} size={14} weight="bold" />
              <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]}>This screen</Text>
            </Pressable>
            <Pressable
              onPress={() => send('Create a useful note from this context.')}
              disabled={isStreaming}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 11,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <NotePencil color={colors.accent} size={14} weight="bold" />
              <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 12 }]}>Save note</Text>
            </Pressable>
          </View>
        ) : null}

        {isStreaming && !messages.some(m => m.id === streamingId && m.content) ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </ScrollView>

      <ChatInput onSend={send} isLoading={isStreaming} onStop={stop} />
    </View>
  );
}
