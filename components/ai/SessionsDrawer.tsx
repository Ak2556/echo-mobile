import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash, MagnifyingGlass, X, ChatCircle } from 'phosphor-react-native';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { tap } from '../../lib/haptics';
import { ChatSession } from '../../types';

interface SessionsDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
}

export function SessionsDrawer({ visible, onClose, onSelect, onNew }: SessionsDrawerProps) {
  const { colors, reduceAnimations } = useTheme();
  const sessions = useAppStore(s => s.sessions);
  const currentSessionId = useAppStore(s => s.currentSessionId);
  const deleteSession = useAppStore(s => s.deleteSession);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    const list = [...sessions].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(s => s.title.toLowerCase().includes(q) || (s.lastMessage ?? '').toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={reduceAnimations ? undefined : FadeIn.duration(160)}
        exiting={reduceAnimations ? undefined : FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        entering={reduceAnimations ? undefined : SlideInLeft.springify().damping(18)}
        exiting={reduceAnimations ? undefined : SlideOutLeft.duration(180)}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '85%',
          maxWidth: 360,
        }}
      >
        <View style={{ flex: 1, overflow: 'hidden', borderTopRightRadius: 24, borderBottomRightRadius: 24 }}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={70} tint={colors.isDark ? 'dark' : 'extraLight'} style={StyleSheet.absoluteFill} />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? colors.glassFill : colors.bg }]} />
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Conversations</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <X color={colors.textSecondary} size={22} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glassBorder,
              }}
            >
              <MagnifyingGlass color={colors.textMuted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search conversations"
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, color: colors.text, fontSize: 15, padding: 0 }}
              />
            </View>
          </View>
          <Pressable
            onPress={() => { tap('light'); onNew(); onClose(); }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginHorizontal: 16,
              marginVertical: 8,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: colors.accent,
            }}
          >
            <Plus color="#fff" size={18} />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>New conversation</Text>
          </Pressable>
          <FlashList
            data={sorted}
            keyExtractor={(s: ChatSession) => s.id}
            ListEmptyComponent={
              <View style={{ padding: 28, alignItems: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', marginBottom: 12 }}>
                  <ChatCircle color={colors.textMuted} size={26} />
                </View>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                  {query.trim() ? 'No matching conversations' : 'Your conversations will live here'}
                </Text>
                <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
                  {query.trim() ? 'Try a different search.' : 'Each thread auto-titles itself once you send the first message.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { tap('light'); onSelect(item.id); onClose(); }}
                onLongPress={() => { tap('warning'); deleteSession(item.id); }}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: pressed ? (colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent',
                  borderLeftWidth: 3,
                  borderLeftColor: item.id === currentSessionId ? colors.accent : 'transparent',
                })}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{item.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{relativeTime(item.updatedAt)}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.lastMessage || 'Empty conversation'}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={(e) => { e.stopPropagation?.(); tap('warning'); deleteSession(item.id); }} style={{ padding: 6, borderRadius: 8 }}>
                  <Trash color={colors.textMuted} size={16} />
                </Pressable>
              </Pressable>
            )}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
