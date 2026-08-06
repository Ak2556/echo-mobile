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
          marginVertical: 5,
          padding: 13,
          borderRadius: 24,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: showUnread ? `${colors.accent}66` : colors.border,
          backgroundColor: showUnread ? colors.accentMuted : colors.surface,
          shadowColor: showUnread ? colors.accent : '#000',
          shadowOpacity: showUnread ? 0.14 : 0.05,
          shadowRadius: showUnread ? 14 : 8,
          shadowOffset: { width: 0, height: 6 },
        }}
        scaleValue={0.98}
        haptic="light"
      >
        {showAvatars && (
          <View style={{ position: 'relative', marginRight: 12 }}>
            <Avatar
              name={conversation.displayName}
              color={conversation.avatarColor}
              url={conversation.isGroup ? undefined : conversation.avatarUrl}
              size={48}
              online={online}
            >
              {conversation.isGroup ? <Users color="#fff" size={19} weight="fill" /> : undefined}
            </Avatar>
            {showUnread && (
              <Animated.View
                entering={animation(FadeIn.duration(120))}
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accent,
                  borderWidth: 2,
                  borderColor: colors.bg,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount > 0 ? conversation.unreadCount : ''}</Text>
              </Animated.View>
            )}
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
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            }}>
              {conversation.lastMessage.toLowerCase().includes('photo')
                ? <Camera color={colors.textMuted} size={11} weight="bold" />
                : conversation.lastMessage.toLowerCase().includes('voice')
                  ? <Microphone color={colors.textMuted} size={11} weight="bold" />
                  : conversation.lastMessage.toLowerCase().includes('link')
                    ? <LinkSimple color={colors.textMuted} size={11} weight="bold" />
                    : <ChatCircleText color={colors.textMuted} size={11} weight="bold" />
              }
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700' }} numberOfLines={1}>
                {conversation.isGroup ? 'Group' : online ? 'Online' : 'DM'}
              </Text>
            </View>
            {showUnread ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent }}>
                <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{ttx("New")}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', marginLeft: 8, gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
            {getTimeAgo(conversation.lastMessageAt)}
          </Text>
          <CaretRight color={colors.textMuted} size={16} />
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
  const filters: { key: InboxFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All', icon: <Envelope color={filter === 'all' ? '#fff' : colors.text} size={15} weight="bold" /> },
    { key: 'unread', label: 'Unread', icon: <Lightning color={filter === 'unread' ? '#fff' : colors.text} size={15} weight="fill" /> },
    { key: 'people', label: 'People', icon: <ChatCircleText color={filter === 'people' ? '#fff' : colors.text} size={15} weight="bold" /> },
    { key: 'groups', label: 'Groups', icon: <Users color={filter === 'groups' ? '#fff' : colors.text} size={15} weight="bold" /> },
    { key: 'pinned', label: 'Pinned', icon: <PushPin color={filter === 'pinned' ? '#fff' : colors.text} size={15} weight="fill" /> },
  ];
  return (
    <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
      <View style={{
        minHeight: 48,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.inputBg,
        borderWidth: 1,
        borderColor: colors.inputBorder,
      }}>
        <MagnifyingGlass color={colors.textMuted} size={17} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={ttx("Search names, messages, groups")}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: colors.text, fontSize: fontSizes.body, paddingVertical: 10 }}
        />
        {query.trim() ? (
          <Pressable onPress={() => onQueryChange('')} hitSlop={8}>
            <X color={colors.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>

      {/* Equal-width segments in a non-scrolling row so the filters always
          fit the screen (the old fixed-width scrolling pills ran off the
          right edge). Wrapper View owns the fill — cssInterop drops box/bg
          props off the Pressable's own style. Counts live in the hero stats
          above, so the chips stay compact: icon + label, with a small count
          badge only when it carries signal (unread / pinned > 0). */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {filters.map(item => {
          const active = filter === item.key;
          const count = counts[item.key];
          const showBadge = count > 0 && (item.key === 'unread' || item.key === 'pinned');
          return (
            <View
              key={item.key}
              style={{
                flex: 1,
                // minWidth:0 lets each segment shrink to an equal share —
                // without it Yoga keeps a segment at least as wide as its
                // label, so longer words made the pills unequal.
                minWidth: 0,
                minHeight: 40,
                borderRadius: 13,
                justifyContent: 'center',
                backgroundColor: active
                  ? colors.accent
                  : (colors.isDark ? 'rgba(255,255,255,0.12)' : '#fff'),
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
                shadowColor: '#000',
                shadowOpacity: colors.isDark ? 0.16 : 0.05,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              <Pressable
                onPress={() => onFilterChange(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ width: '100%' }}
              >
                {({ pressed }) => (
                  // Render-prop child View (a plain View, cssInterop-safe) owns
                  // the full-width fill + centering + press feedback. Putting
                  // these on the touchable's own style drops them and the
                  // icon + label collapse to the left.
                  <View style={{ width: '100%', minHeight: 40, borderRadius: 13, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.72 : 1 }}>
                    {item.icon}
                    <Text
                      style={{
                        flexShrink: 1,
                        textAlign: 'center',
                        color: active ? '#fff' : colors.text,
                        fontSize: 13,
                        fontWeight: '800',
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {item.label}
                    </Text>
                    {showBadge ? (
                      <View style={{
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        paddingHorizontal: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? 'rgba(255,255,255,0.24)' : colors.accent,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                          {count}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
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
          <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>{ttx("Messages")}</Text>
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
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: colors.text, fontSize: 24, lineHeight: 29, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>{ttx("Messages")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
            {unreadTotal ? `${unreadTotal} unread · Echo-ready` : 'Private · rich · remembered'}
          </Text>
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
            <InboxHero
              total={active.length}
              unread={unreadTotal}
              groups={counts.groups}
              pinned={counts.pinned}
              onNewGroup={() => setGroupModalOpen(true)}
              onFindPeople={() => router.push('/(tabs)/explore')}
            />
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
      </View>
    );
  }
  return listPane;
}
