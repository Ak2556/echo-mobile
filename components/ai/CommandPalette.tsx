import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter, type Href } from 'expo-router';
import { Brain, Envelope, GearSix, Lightning, MagnifyingGlass, PencilSimple, SquaresFour, X, ArrowUp, Question } from 'phosphor-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ActionCenter } from './ActionCenter';
import { useCommandPalette } from '../../lib/commandPalette';
import { streamEchoAI } from '../../lib/api';
import { isLocalTool } from '../../lib/localTools';
import { localContinuationFailureMessage, runLocalToolFlow } from '../../lib/localToolFlow';
import { useTheme } from '../../lib/theme';
import { ToolCallCard, ToolCallItem } from './ToolCallCard';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { IconBadge } from '../ui/IconBadge';
import { usePerformanceProfile } from '../../lib/performance';
import { useAppStore } from '../../store/useAppStore';
import { assistantLanguageInstruction } from '../../lib/languages';

type Item =
  | { kind: 'text'; id: string; role: 'user' | 'assistant'; content: string }
  | { kind: 'tool'; tool: ToolCallItem };

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const { colors, reduceAnimations } = useTheme();
  const performance = usePerformanceProfile('overlay');
  const appLanguage = useAppStore(s => s.appLanguage);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [showActionCenter, setShowActionCenter] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const shortcuts: { key: string; label: string; href: Href; icon: React.ReactNode }[] = [
    { key: 'create', label: 'New Echo', href: '/create-post', icon: <PencilSimple color={colors.accent} size={16} /> },
    { key: 'search', label: 'Explore', href: '/(tabs)/explore', icon: <MagnifyingGlass color={colors.accent} size={16} /> },
    { key: 'messages', label: 'Messages', href: '/messages', icon: <Envelope color={colors.accent} size={16} /> },
    { key: 'apps', label: 'Tools', href: '/(tabs)/apps', icon: <SquaresFour color={colors.accent} size={16} /> },
    { key: 'partners', label: 'Thinking partners', href: '/thinking-partners', icon: <Brain color={colors.accent} size={16} /> },
    { key: 'settings', label: 'Settings', href: '/settings', icon: <GearSix color={colors.accent} size={16} /> },
  ];

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setItems([]);
      conversationIdRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const upsertText = (id: string, role: 'user' | 'assistant', delta: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === 'text' && i.id === id);
      if (idx >= 0) {
        const next = prev.slice();
        const existing = next[idx] as Extract<Item, { kind: 'text' }>;
        next[idx] = { ...existing, content: existing.content + delta };
        return next;
      }
      return [...prev, { kind: 'text', id, role, content: delta }];
    });
  };

  const upsertTool = (tool: ToolCallItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === 'tool' && i.tool.id === tool.id);
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
      try {
        await streamEchoAI({
          conversationId: conversationIdRef.current ?? undefined,
          personaContext: assistantLanguageInstruction(appLanguage),
          localResult: {
            tool_call_id: tool.id,
            tool_name: tool.name,
            args: tool.args,
            ok,
            result,
            error,
          },
          onEvent: (e) => {
            if (e.type === 'conversation') conversationIdRef.current = e.id;
            else if (e.type === 'text_delta') upsertText(`a-${Date.now()}`, 'assistant', e.delta);
            else if (e.type === 'tool_result') {
              upsertTool({
                id: e.id,
                name: e.name,
                preview: tool.preview,
                args: tool.args,
                status: e.ok ? 'ok' : 'error',
                resultSummary: tool.resultSummary,
                errorMessage: e.error,
              });
            }
          },
        });
      } catch (err: any) {
        upsertText(`local-stream-err-${Date.now()}`, 'assistant', localContinuationFailureMessage(tool, ok, err?.message ?? 'unknown error'));
      }
    },
    [appLanguage],
  );

  const runLocalTool = useCallback(
    async (tool: ToolCallItem) => {
      await runLocalToolFlow(tool, {
        upsertTool,
        appendAssistantText: (text) => upsertText(`local-err-${Date.now()}`, 'assistant', text),
        continueWithLocalResult,
      });
    },
    [continueWithLocalResult],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setItems((prev) => [...prev, { kind: 'text', id: uid, role: 'user', content: text }]);
    setBusy(true);
    try {
      await streamEchoAI({
        message: text,
        conversationId: conversationIdRef.current ?? undefined,
        personaContext: assistantLanguageInstruction(appLanguage),
        onEvent: (e) => {
          if (e.type === 'conversation') conversationIdRef.current = e.id;
          else if (e.type === 'text_delta') upsertText(aid, 'assistant', e.delta);
          else if (e.type === 'tool_call_pending') {
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
          }
          else if (e.type === 'tool_result')
            upsertTool({
              id: e.id,
              name: e.name,
              preview: '',
              args: undefined,
              status: e.ok ? 'ok' : 'error',
              errorMessage: e.error,
            });
        },
      });
    } catch (err: any) {
      upsertText(`err-${Date.now()}`, 'assistant', `Error: ${err?.message ?? 'unknown'}`);
    } finally {
      setBusy(false);
    }
  }, [appLanguage, input, busy, runLocalTool]);

  const confirmTool = useCallback(
    async (tool: ToolCallItem, approve: boolean) => {
      upsertTool({ ...tool, status: approve ? 'running' : 'rejected' });
      if (isLocalTool(tool.name)) {
        if (!approve) {
          setBusy(true);
          try {
            await streamEchoAI({
              conversationId: conversationIdRef.current ?? undefined,
              personaContext: assistantLanguageInstruction(appLanguage),
              confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve: false },
              onEvent: (e) => {
                if (e.type === 'text_delta') upsertText(`a-${Date.now()}`, 'assistant', e.delta);
              },
            });
          } finally {
            setBusy(false);
          }
          return;
        }
        setBusy(true);
        try {
          await runLocalTool(tool);
        } finally {
          setBusy(false);
        }
        return;
      }

      setBusy(true);
      try {
        await streamEchoAI({
          conversationId: conversationIdRef.current ?? undefined,
          personaContext: assistantLanguageInstruction(appLanguage),
          confirm: { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, approve },
          onEvent: (e) => {
            if (e.type === 'text_delta') upsertText(`a-${Date.now()}`, 'assistant', e.delta);
            else if (e.type === 'tool_result')
              upsertTool({
                id: e.id,
                name: e.name,
                preview: tool.preview,
                args: tool.args,
                status: e.ok ? 'ok' : 'error',
                errorMessage: e.error,
              });
          },
        });
      } finally {
        setBusy(false);
      }
    },
    [appLanguage, runLocalTool],
  );

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Blurred backdrop */}
      <View style={StyleSheet.absoluteFill}>
        {performance.useBlur ? (
          <BlurView intensity={performance.maxBlurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.55)' },
          ]}
        />
      </View>

      <Pressable
        onPress={close}
        style={{ flex: 1, justifyContent: 'flex-start' }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ marginTop: 80, marginHorizontal: 16, marginBottom: 120 }}
          >
            <Animated.View
              entering={reduceAnimations ? undefined : FadeIn.duration(80)}
              exiting={reduceAnimations ? undefined : FadeOut.duration(60)}
              style={{ maxHeight: '80%' }}
            >
              <GlassPanel variant="ultra" borderRadius={20} elevated performanceMode="overlay">
                {/* Header / input row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    gap: 10,
                    borderBottomWidth: items.length > 0 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.glassBorder,
                  }}
                >
                  <Lightning color={colors.accent} size={20} weight="fill" />
                  <AnimatedPressable
                    onPress={() => setShowActionCenter(true)}
                    performanceMode="overlay"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    haptic="light"
                  >
                    <Question size={16} color={colors.textSecondary} />
                  </AnimatedPressable>
                  <TextInput
                    ref={inputRef}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={send}
                    placeholder="Ask Echo anything…"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="send"
                    style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 6 }}
                    editable={!busy}
                    autoFocus
                  />
                  <AnimatedPressable
                    onPress={input.trim() ? send : close}
                    performanceMode="overlay"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: input.trim() ? colors.accent : (colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    haptic="light"
                  >
                    {input.trim() ? (
                      <ArrowUp size={18} color="#fff" weight="bold" />
                    ) : (
                      <X size={16} color={colors.textSecondary} />
                    )}
                  </AnimatedPressable>
                </View>

                {items.length === 0 && (
                  <View style={{ padding: 14, gap: 8 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {shortcuts.map(shortcut => (
                        <AnimatedPressable
                          key={shortcut.key}
                          onPress={() => {
                            close();
                            router.push(shortcut.href);
                          }}
                          performanceMode="overlay"
                          haptic="light"
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            borderRadius: 999,
                            backgroundColor: colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.glassBorder,
                          }}
                        >
                          <IconBadge color={colors.accent} size={24} radius={9} muted>
                            {shortcut.icon}
                          </IconBadge>
                          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                            {shortcut.label}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </View>
                )}

                {items.length > 0 && (
                  <ScrollView
                    style={{ maxHeight: 420 }}
                    contentContainerStyle={{ paddingVertical: 8 }}
                  >
                    {items.map((item) =>
                      item.kind === 'text' ? (
                        <View
                          key={`t-${item.id}`}
                          style={{ paddingHorizontal: 16, paddingVertical: 6 }}
                        >
                          <Text
                            style={{
                              color: item.role === 'user' ? colors.textMuted : colors.text,
                              fontSize: 14,
                              fontWeight: item.role === 'user' ? '500' : '400',
                              lineHeight: 20,
                            }}
                          >
                            {item.role === 'user' ? '› ' : ''}
                            {item.content}
                          </Text>
                        </View>
                      ) : (
                        <ToolCallCard
                          key={`c-${item.tool.id}`}
                          item={item.tool}
                          onConfirm={(t) => confirmTool(t, true)}
                          onReject={(t) => confirmTool(t, false)}
                        />
                      ),
                    )}
                  </ScrollView>
                )}
              </GlassPanel>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
      <ActionCenter visible={showActionCenter} onClose={() => setShowActionCenter(false)} onSelectExample={setInput} />
    </Modal>
  );
}
