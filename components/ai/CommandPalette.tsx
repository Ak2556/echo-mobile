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
} from 'react-native';
import { Lightning, X, ArrowUp } from 'phosphor-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCommandPalette } from '../../lib/commandPalette';
import { streamEchoAI } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { ToolCallCard, ToolCallItem } from './ToolCallCard';
import { AnimatedPressable } from '../ui/AnimatedPressable';

// One-shot ask-anything sheet. Reuses the same edge function & conversation
// concept as the chat tab, but starts fresh each open so the palette stays
// snappy and unscarred by the day's history.

type Item =
  | { kind: 'text'; id: string; role: 'user' | 'assistant'; content: string }
  | { kind: 'tool'; tool: ToolCallItem };

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset the palette each open.
      setInput('');
      setItems([]);
      conversationIdRef.current = null;
      // Defer focus so the modal is mounted first.
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
        onEvent: (e) => {
          if (e.type === 'conversation') conversationIdRef.current = e.id;
          else if (e.type === 'text_delta') upsertText(aid, 'assistant', e.delta);
          else if (e.type === 'tool_call_pending')
            upsertTool({
              id: e.id,
              name: e.name,
              preview: e.preview,
              args: e.args,
              status: 'pending_confirm',
            });
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
  }, [input, busy]);

  const confirmTool = useCallback(
    async (tool: ToolCallItem, approve: boolean) => {
      upsertTool({ ...tool, status: approve ? 'running' : 'rejected' });
      setBusy(true);
      try {
        await streamEchoAI({
          conversationId: conversationIdRef.current ?? undefined,
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
    [],
  );

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start' }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ marginTop: 80, marginHorizontal: 16 }}>
            <Animated.View
              entering={FadeIn.duration(120)}
              exiting={FadeOut.duration(80)}
              style={{
                backgroundColor: colors.bg,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
                maxHeight: '80%',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  gap: 10,
                  borderBottomWidth: items.length > 0 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Lightning color={colors.accent} size={20} weight="fill" />
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
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: input.trim() ? colors.accent : colors.surface,
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

              {items.length > 0 && (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingVertical: 8 }}>
                  {items.map((item) =>
                    item.kind === 'text' ? (
                      <View
                        key={`t-${item.id}`}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                        }}
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
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
