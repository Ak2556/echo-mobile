import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Alert, Pressable, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, PencilSimple, Envelope, SealCheck, BellSlash, Archive,
  CaretDown, CaretRight, Users, X, MagnifyingGlass, Check, PushPin,
  ChatCircleText, Lightning, Camera, LinkSimple, Microphone,
} from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { persistGet, persistSet } from '../../store/persist';
import { EmptyState } from '../../components/common/EmptyState';
import { useResponsiveLayout } from '../../lib/responsive';
import { DMView } from './[id]';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { Avatar } from '../../components/ui/Avatar';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Conversation } from '../../types';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useCreateGroupConversation, useRemoteConversations, useSetDMPref } from '../../hooks/queries/useDMs';
import { usePresenceTracking } from '../../lib/presence';
import { ConversationSkeleton } from '../../components/ui/Skeleton';
import { RemoteConversation, searchRemoteUsers, UserSearchHit } from '../../lib/supabaseEchoApi';
import { safeBack } from '../../lib/safeBack';
import { ttx } from '../../lib/i18n';
import { MusicPickerModal, Song } from '../../components/ui/MusicPicker';
import { ChatDetailsSidebar } from '../../components/chat/ChatDetailsSidebar';

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

type InboxConversation = Conversation & {
  muted?: boolean;
  archived?: boolean;
  markedUnread?: boolean;
  isGroup?: boolean;
  memberCount?: number;
};

type InboxFilter = 'all' | 'unread' | 'people' | 'groups' | 'pinned';

function previewMeta(conversation: InboxConversation): { label: string; icon: React.ReactNode } {
  const text = conversation.lastMessage || '';
  const lower = text.toLowerCase();
  if (lower.includes('photo')) return { label: 'Photo', icon: null };
  if (lower.includes('voice')) return { label: 'Voice', icon: null };
  if (lower.includes('link')) return { label: 'Link', icon: null };
  if (conversation.isGroup) return { label: `${conversation.memberCount ?? 1} members`, icon: null };
  return { label: text || `@${conversation.username}`, icon: null };
}

function CreateGroupModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const { colors, radius, fontSizes } = useTheme();
  const createGroup = useCreateGroupConversation();
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserSearchHit[]>([]);
  const [selected, setSelected] = useState<UserSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchRemoteUsers(query, 12);
        setHits(rows);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) {
      setTitle('');
      setQuery('');
      setSelected([]);
      setHits([]);
    }
  }, [visible]);

  const toggle = (user: UserSearchHit) => {
    setSelected(prev => prev.some(item => item.id === user.id)
      ? prev.filter(item => item.id !== user.id)
      : [...prev, user].slice(0, 31));
  };

  const submit = () => {
    if (selected.length < 1) {
      Alert.alert('Choose people', 'Pick at least one person for the group.');
      return;
    }
    createGroup.mutate(
      { title: title.trim() || selected.map(u => u.display_name || u.username).slice(0, 3).join(', '), memberIds: selected.map(u => u.id) },
      {
        onSuccess: conversationId => {
          onClose();
          onCreated(conversationId);
        },
        onError: error => Alert.alert('Could not create group', error instanceof Error ? error.message : 'Try again.'),
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <X color={colors.text} size={22} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold' }}>
            {ttx("New Group")}
          </Text>
          <Pressable
            onPress={submit}
            disabled={createGroup.isPending}
            style={{ opacity: selected.length ? 1 : 0.45 }}
          >
            {createGroup.isPending
              ? <ActivityIndicator color={colors.accent} />
              : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>{ttx("Create")}</Text>}
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{ttx("Group name")}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={ttx("Weekend builders, design crew...")}
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: fontSizes.body, paddingVertical: 4 }}
            />
          </View>

          <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={ttx("Search people")}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: colors.text, fontSize: fontSizes.body }}
            />
            {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>

          {selected.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {selected.map(user => (
                <Pressable
                  key={user.id}
                  onPress={() => toggle(user)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentMuted }}
                >
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>
                    {user.display_name || user.username}
                  </Text>
                  <X color={colors.accent} size={12} weight="bold" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          {hits.map(user => {
            const active = selected.some(item => item.id === user.id);
            return (
              <Pressable
                key={user.id}
                onPress={() => toggle(user)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Avatar
                  name={user.display_name || user.username}
                  color={user.avatar_color}
                  url={user.avatar_url}
                  size={42}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                    {user.display_name || user.username}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>@{user.username}</Text>
                </View>
                <View style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.accent : colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? colors.accent : colors.border,
                }}>
                  {active ? <Check color="#fff" size={15} weight="bold" /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ConversationCard({ conversation, index, pinned, onPress, onLongPress }: {
  conversation: InboxConversation; index: number; pinned?: boolean; onPress: () => void; onLongPress?: () => void;
}) {
  const { colors, fontSizes, showAvatars, animation, isUserOnline } = useTheme();
  const online = !conversation.isGroup && isUserOnline(conversation.userId);
  const showUnread = (conversation.unreadCount > 0 || !!conversation.markedUnread) && !conversation.muted;
  const meta = previewMeta(conversation);
  const draft = persistGet<string>('chat:draft:' + conversation.id, '').trim();
  const preview = draft
    ? `Draft · ${draft}`
    : conversation.isGroup && conversation.lastMessage
    ? `${meta.label} · ${conversation.lastMessage}`
    : meta.label;

  return (
    <Animated.View entering={animation(FadeIn.delay(index * 20).duration(80))}>
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 16,
          marginVertical: 4,
          padding: 14,
          borderRadius: 20,
          backgroundColor: colors.isDark ? '#1C1C1E' : colors.surface,
        }}
        scaleValue={0.98}
        haptic="light"
      >
        {showAvatars && (
          <View style={{ marginRight: 14 }}>
            <Avatar
              name={conversation.displayName}
              color={conversation.avatarColor}
              url={conversation.isGroup ? undefined : conversation.avatarUrl}
              size={50}
              online={online}
              squircle
            >
              {conversation.isGroup ? <Users color="#fff" size={19} weight="fill" /> : undefined}
            </Avatar>
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              flexShrink: 1,
              fontWeight: showUnread ? '800' : '700',
              fontSize: fontSizes.body,
              color: colors.text,
            }} numberOfLines={1}>
              {conversation.displayName}
            </Text>
            {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            {conversation.muted && <BellSlash color={colors.textMuted} size={13} weight="fill" />}
            {conversation.isGroup && <Users color={colors.textMuted} size={13} weight="fill" />}
            {pinned && <PushPin color={colors.accent} size={13} weight="fill" />}
          </View>
          <Text
            style={{
              fontSize: fontSizes.small, marginTop: 2,
              color: draft ? colors.accent : showUnread ? colors.textSecondary : colors.textMuted,
              fontWeight: draft || showUnread ? '700' : '400',
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}>
              {conversation.lastMessage.toLowerCase().includes('photo')
                ? <Camera color={colors.textMuted} size={14} weight="bold" />
                : conversation.lastMessage.toLowerCase().includes('voice')
                  ? <Microphone color={colors.textMuted} size={14} weight="bold" />
                  : conversation.lastMessage.toLowerCase().includes('link')
                    ? <LinkSimple color={colors.textMuted} size={14} weight="bold" />
                    : null
              }
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', marginLeft: 8, gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
            {getTimeAgo(conversation.lastMessageAt)}
          </Text>
          {showUnread && (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount > 0 ? conversation.unreadCount : ''}</Text>
            </View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

function InboxHero({
  total,
  unread,
  groups,
  pinned,
  onNewGroup,
  onFindPeople,
}: {
  total: number;
  unread: number;
  groups: number;
  pinned: number;
  onNewGroup: () => void;
  onFindPeople: () => void;
}) {
  const { colors } = useTheme();
  const stats = [
    { label: 'Unread', value: unread },
    { label: 'Groups', value: groups },
    { label: 'Pinned', value: pinned },
  ];
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, marginBottom: 10, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <LinearGradient
        colors={[`${colors.accent}4A`, `${colors.accent}16`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <ChatCircleText color="#fff" size={27} weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontSize: 26, lineHeight: 31, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>
              {total ? 'Pick up where you left off.' : 'Start a conversation.'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
              {total === 0
                ? 'Message anyone on Echo, or start a group.'
                : unread > 0
                  ? `${unread} unread message${unread === 1 ? '' : 's'} waiting across ${total} chat${total === 1 ? '' : 's'}.`
                  : `You're all caught up across ${total} conversation${total === 1 ? '' : 's'}.`}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {stats.map(stat => (
            <View key={stat.label} style={{ flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{stat.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Wrapper Views own the flex sizing + pill styling; the Pressables
            stay bare — NativeWind's cssInterop otherwise drops the box/layout
            off a touchable's own style and the buttons collapse. */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Pressable onPress={onFindPeople} accessibilityRole="button" accessibilityLabel={ttx("New chat")} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
              <View style={{ minHeight: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                <PencilSimple color="#fff" size={17} weight="bold" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{ttx("New chat")}</Text>
              </View>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Pressable onPress={onNewGroup} accessibilityRole="button" accessibilityLabel={ttx("New group")} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
              <View style={{ minHeight: 46, borderRadius: 16, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                <Users color={colors.text} size={17} weight="bold" />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900' }}>{ttx("New group")}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function InboxToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: InboxFilter;
  onFilterChange: (value: InboxFilter) => void;
  counts: Record<InboxFilter, number>;
}) {
  const { colors, fontSizes } = useTheme();
  const filters: { key: InboxFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'people', label: 'Personal' },
    { key: 'groups', label: 'Group' },
  ];
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 16 }}>
      {/* Search Bar - Pill Shaped */}
      <View style={{
        height: 40,
        borderRadius: 20,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.isDark ? '#222224' : colors.inputBg,
      }}>
        <MagnifyingGlass color={colors.textMuted} size={18} weight="bold" />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 0 }}
        />
        {query.trim() ? (
          <Pressable onPress={() => onQueryChange('')} hitSlop={8}>
            <X color={colors.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Chips */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {filters.map(item => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onFilterChange(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 18,
                backgroundColor: active ? colors.accent : 'transparent',
                borderWidth: active ? 0 : 1,
                borderColor: active ? 'transparent' : colors.textMuted,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: active ? '#fff' : colors.textMuted,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function StatusAvatar({ name, color, url, isMe, aura, onPress }: any) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginHorizontal: 8, marginTop: 16, position: 'relative' }}>
      {aura ? (
        <Animated.View entering={FadeIn} style={{
          position: 'absolute', top: -28, zIndex: 10,
          backgroundColor: colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
          paddingHorizontal: 10, paddingVertical: 5,
          borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
        }}>
          <Text style={{ fontSize: 11, color: colors.text, fontWeight: '700' }} numberOfLines={1}>{aura.text_content || 'Voice Note'}</Text>
        </Animated.View>
      ) : null}
      <View style={{
        padding: 3, borderRadius: 999,
        borderWidth: 2, borderColor: aura ? colors.accent : 'transparent',
      }}>
        <Avatar name={name} color={color} url={url} size={64} />
        {isMe && !aura ? (
          <View style={{
            position: 'absolute', bottom: 0, right: 0,
            backgroundColor: colors.accent, borderRadius: 14, width: 28, height: 28,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: colors.bg,
          }}>
            <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20, fontWeight: 'bold' }}>+</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, fontWeight: '600' }}>
        {isMe ? 'Your Aura' : name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

export function AurasRow() {
  const { colors, radius, fontSizes } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [auraText, setAuraText] = useState('');
  const [myAura, setMyAura] = useState<any>(null);
  const [viewingAura, setViewingAura] = useState<any>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<Song | null>(null);

  const mockAuras = [
    { id: '1', name: 'Akash', color: '#FF5733', aura: { text_content: 'Deep work 🎧' } },
    { id: '2', name: 'Elena', color: '#33FF57', aura: { text_content: 'At the gym 💪' } },
    { id: '3', name: 'Sarah', color: '#3357FF', aura: { text_content: 'Need coffee ☕' } },
  ];

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 8 }}>
        <StatusAvatar
          name="Me" color={colors.accent} isMe
          aura={myAura}
          onPress={() => setModalOpen(true)}
        />
        {mockAuras.map((a: any) => (
          <StatusAvatar key={a.id} name={a.name} color={a.color} aura={a.aura} onPress={() => setViewingAura(a)} />
        ))}
      </ScrollView>

      {/* Viewer Modal */}
      <Modal visible={!!viewingAura} animationType="fade" transparent onRequestClose={() => setViewingAura(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setViewingAura(null)}>
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Avatar name={viewingAura?.name ?? '?'} color={viewingAura?.color} size={100} />
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>{viewingAura?.name}</Text>
            {viewingAura?.aura?.text_content ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24 }}>
                <Text style={{ color: '#fff', fontSize: 20 }}>{viewingAura.aura.text_content}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={modalOpen} animationType="fade" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', marginBottom: 16 }}>Set your Aura</Text>
            <TextInput
              value={auraText}
              onChangeText={setAuraText}
              placeholder="What's your vibe? (e.g. Deep work)"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: fontSizes.body, backgroundColor: colors.inputBg, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 12 }}
            />
            {selectedMusic ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHover, padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>🎵 {selectedMusic.title} - {selectedMusic.artist}</Text>
                <Pressable onPress={() => setSelectedMusic(null)} hitSlop={10}><Text style={{ color: colors.danger, fontWeight: '700' }}>X</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setMusicPickerOpen(true)} style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>+ Add Music</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={{ flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.surfaceHover }} onPress={() => setModalOpen(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: colors.accent }} onPress={() => {
                setMyAura(auraText || selectedMusic ? { text_content: auraText, music_title: selectedMusic?.title, music_artist: selectedMusic?.artist, music_url: selectedMusic?.url } : null);
                setModalOpen(false);
                setAuraText('');
                setSelectedMusic(null);
              }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Publish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <MusicPickerModal visible={musicPickerOpen} onClose={() => setMusicPickerOpen(false)} onSelect={(song) => { setSelectedMusic(song); setMusicPickerOpen(false); }} />
    </View>
  );
}

export default function MessagesListScreen() {
  usePresenceTracking(useAppStore(s => s.userId) ?? undefined);
  const router = useRouter();
  const { conversations: localConversations } = useAppStore();
  const { colors, fontSizes } = useTheme();
  const remote = isSupabaseRemote();
  const { data: remoteConvs = [], isLoading: remoteLoading } = useRemoteConversations();
  const setPref = useSetDMPref();
  const [showArchived, setShowArchived] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    const v = persistGet<string[]>('chat:pinnedConversations', []);
    return Array.isArray(v) ? v : [];
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  // Master-detail: on iPad/Mac (wide) the inbox and the open thread sit side by
  // side; on phone, selecting a conversation pushes the /messages/[id] route.
  const layout = useResponsiveLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const twoPane = layout.width >= 880;
  const threePane = layout.width >= 1100;
  const openConversation = (cid: string) => {
    if (twoPane) setSelectedId(cid);
    else router.push(`/messages/${cid}`);
  };

  // Deep-link support: /messages?newGroup=1 (chat-tab "New group" button)
  const { newGroup } = useLocalSearchParams<{ newGroup?: string }>();
  useEffect(() => {
    if (newGroup === '1') setGroupModalOpen(true);
  }, [newGroup]);

  // Resolve conversations: use remote when available, local only in non-remote mode
  const conversations: InboxConversation[] = remote
    ? remoteConvs.map((rc: RemoteConversation) => ({
        id: rc.id,
        userId: rc.otherUserId ?? rc.id,
        username: rc.isGroup ? 'group' : rc.otherUsername,
        displayName: rc.otherDisplayName,
        avatarColor: rc.otherAvatarColor,
        avatarUrl: rc.otherAvatarUrl ?? undefined,
        isVerified: false,
        lastMessage: rc.lastMessage ?? '',
        lastMessageAt: rc.lastMessageAt ?? new Date().toISOString(),
        unreadCount: rc.unreadCount,
        muted: rc.muted,
        archived: rc.archived,
        markedUnread: rc.markedUnread,
        isGroup: rc.isGroup,
        memberCount: rc.memberCount,
      }))
    : localConversations;

  // Pinned conversations live locally (no backend field needed) and always
  // sort to the top, like every top messaging app.
  const isPinned = (id: string) => pinnedIds.includes(id);
  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [id, ...prev].slice(0, 12);
      persistSet('chat:pinnedConversations', next);
      return next;
    });
  };

  const sorted = [...conversations].sort((a, b) => {
    const pa = isPinned(a.id) ? 1 : 0;
    const pb = isPinned(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
  const active = sorted.filter(c => !c.archived);
  const archived = sorted.filter(c => c.archived);
  const unreadTotal = active.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0);
  const queryText = query.trim().toLowerCase();
  const counts: Record<InboxFilter, number> = {
    all: active.length,
    unread: active.filter(c => c.unreadCount > 0 && !c.muted).length,
    people: active.filter(c => !c.isGroup).length,
    groups: active.filter(c => c.isGroup).length,
    pinned: active.filter(c => isPinned(c.id)).length,
  };
  const filteredActive = active.filter(c => {
    if (filter === 'unread' && !(c.unreadCount > 0 && !c.muted)) return false;
    if (filter === 'people' && c.isGroup) return false;
    if (filter === 'groups' && !c.isGroup) return false;
    if (filter === 'pinned' && !isPinned(c.id)) return false;
    if (!queryText) return true;
    return [
      c.displayName,
      c.username,
      c.lastMessage,
      c.isGroup ? 'group' : 'dm',
    ].filter(Boolean).join(' ').toLowerCase().includes(queryText);
  });

  const openActions = (c: InboxConversation) => {
    if (!remote) return;
    Alert.alert(c.displayName, undefined, [
      {
        text: isPinned(c.id) ? 'Unpin' : 'Pin to top',
        onPress: () => togglePin(c.id),
      },
      {
        text: c.muted ? 'Unmute notifications' : 'Mute notifications',
        onPress: () => setPref.mutate({ conversationId: c.id, patch: { muted: !c.muted } }),
      },
      {
        text: c.archived ? 'Unarchive' : 'Archive',
        onPress: () => setPref.mutate({ conversationId: c.id, patch: { archived: !c.archived } }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const SwipeAction = ({ icon, label, bg, onPress }: { icon: React.ReactNode; label: string; bg: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ width: 76, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: bg }}>
      {icon}
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  const renderCard = (item: InboxConversation, index: number) => (
    <Swipeable
      key={item.id}
      overshootRight={false}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          <SwipeAction
            icon={<PushPin color="#fff" size={19} weight={isPinned(item.id) ? 'fill' : 'regular'} />}
            label={isPinned(item.id) ? 'Unpin' : 'Pin'}
            bg={colors.accent}
            onPress={() => togglePin(item.id)}
          />
          {remote && (
            <SwipeAction
              icon={<BellSlash color="#fff" size={19} weight={item.muted ? 'fill' : 'regular'} />}
              label={item.muted ? 'Unmute' : 'Mute'}
              bg={colors.textMuted}
              onPress={() => setPref.mutate({ conversationId: item.id, patch: { muted: !item.muted } })}
            />
          )}
          {remote && (
            <SwipeAction
              icon={<Archive color="#fff" size={19} weight={item.archived ? 'fill' : 'regular'} />}
              label={item.archived ? 'Restore' : 'Archive'}
              bg={colors.danger}
              onPress={() => setPref.mutate({ conversationId: item.id, patch: { archived: !item.archived } })}
            />
          )}
        </View>
      )}
    >
      <View style={{ backgroundColor: colors.bg }}>
        <ConversationCard
          conversation={item}
          index={index}
          pinned={isPinned(item.id)}
          onPress={() => openConversation(item.id)}
          onLongPress={() => openActions(item)}
        />
      </View>
    </Swipeable>
  );

  if (remote && remoteLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AnimatedPressable onPress={() => safeBack('/(tabs)/chat')} className="p-1" scaleValue={0.88} haptic="light">
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', padding: 3, borderRadius: 999 }}>
              <Pressable onPress={() => safeBack('/(tabs)/chat')} style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>Echo</Text>
              </Pressable>
              <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Messages</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AnimatedPressable onPress={() => setGroupModalOpen(true)} className="p-1" scaleValue={0.88} haptic="light">
              <Users color={colors.accent} size={22} weight="bold" />
            </AnimatedPressable>
            <AnimatedPressable onPress={() => router.push('/(tabs)/explore')} className="p-1" scaleValue={0.88} haptic="light">
              <PencilSimple color={colors.accent} size={22} />
            </AnimatedPressable>
          </View>
        </View>
        <View style={{ paddingTop: 4 }}>
          {Array.from({ length: 7 }).map((_, i) => <ConversationSkeleton key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  const listPane = (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}>
        <AnimatedPressable onPress={() => safeBack('/(tabs)/chat')} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={22} />
        </AnimatedPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', padding: 3, borderRadius: 999 }}>
            <Pressable onPress={() => safeBack('/(tabs)/chat')} style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>Echo</Text>
            </Pressable>
            <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Messages</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <AnimatedPressable onPress={() => setGroupModalOpen(true)} style={{ width: 40, height: 40, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} scaleValue={0.88} haptic="light">
            <Users color={colors.accent} size={20} weight="bold" />
          </AnimatedPressable>
          <AnimatedPressable onPress={() => router.push('/(tabs)/explore')} style={{ width: 40, height: 40, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }} scaleValue={0.88} haptic="light">
            <PencilSimple color="#fff" size={20} weight="bold" />
          </AnimatedPressable>
        </View>
      </View>

      <FlashList
        data={filteredActive}
        renderItem={({ item, index }) => renderCard(item, index)}
        keyExtractor={item => item.id}
        ListHeaderComponent={(
          <View>
            <AurasRow />
            <InboxToolbar
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={setFilter}
              counts={counts}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>
                {filter === 'all' ? 'Recent conversations' : `${filter[0].toUpperCase()}${filter.slice(1)} conversations`}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                {filteredActive.length} {ttx("shown")}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 26 }}>
            <EmptyState
              icon={<Envelope color={colors.accent} size={32} />}
              title={queryText || filter !== 'all' ? 'No matching conversations' : 'No messages yet'}
              subtitle={queryText || filter !== 'all'
                ? 'Try another filter or search term.'
                : 'Start a conversation by visiting someone’s profile and tapping the message button.'}
              actionLabel={queryText || filter !== 'all' ? 'Show all' : 'Find people'}
              onAction={() => {
                if (queryText || filter !== 'all') { setQuery(''); setFilter('all'); }
                else router.push('/(tabs)/explore');
              }}
            />
          </View>
        )}
        ListFooterComponent={archived.length > 0 ? (
            <View>
              <Pressable
                onPress={() => setShowArchived(v => !v)}
                accessibilityRole="button"
                accessibilityLabel={showArchived ? 'Hide archived conversations' : 'Show archived conversations'}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                }}>
                  <Archive color={colors.textMuted} size={17} />
                  <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '600', flex: 1 }}>
                    {ttx("Archived ·")} {archived.length}
                  </Text>
                  {showArchived
                    ? <CaretDown color={colors.textMuted} size={14} />
                    : <CaretRight color={colors.textMuted} size={14} />}
                </View>
              </Pressable>
              {showArchived && archived.map((item, i) => (
                <React.Fragment key={item.id}>{renderCard(item, i)}</React.Fragment>
              ))}
            </View>
        ) : <View style={{ height: 18 }} />}
      />
      <CreateGroupModal
        visible={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreated={conversationId => router.push(`/messages/${conversationId}`)}
      />
    </SafeAreaView>
  );

  if (twoPane) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
        <View style={{ width: 360, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}>
          {listPane}
        </View>
        <View style={{ flex: 1 }}>
          {selectedId ? (
            <DMView key={selectedId} id={selectedId} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <EmptyState
                icon={<ChatCircleText color={colors.textSecondary} size={32} />}
                title={ttx("Your messages")}
                subtitle={ttx("Select a conversation to start reading.")}
              />
            </View>
          )}
        </View>
        {threePane && selectedId && (
          <ChatDetailsSidebar
            recipient={{
              name: selectedId, 
              handle: selectedId.toLowerCase().replace(' ', ''),
              avatar: 'https://i.pravatar.cc/150' // Mocks for now, this would normally be fetched
            }}
            colors={colors}
          />
        )}
      </View>
    );
  }
  return listPane;
}
