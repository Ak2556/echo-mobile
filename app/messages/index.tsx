import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Alert, Pressable, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PencilSimple, Envelope, SealCheck, BellSlash, Archive, CaretDown, CaretRight, Users, X, MagnifyingGlass, Check } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { EmptyState } from '../../components/common/EmptyState';
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
  isGroup?: boolean;
  memberCount?: number;
};

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
            New Group
          </Text>
          <Pressable
            onPress={submit}
            disabled={createGroup.isPending}
            style={{ opacity: selected.length ? 1 : 0.45 }}
          >
            {createGroup.isPending
              ? <ActivityIndicator color={colors.accent} />
              : <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>Create</Text>}
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>Group name</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Weekend builders, design crew..."
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: fontSizes.body, paddingVertical: 4 }}
            />
          </View>

          <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people"
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

function ConversationCard({ conversation, index, onPress, onLongPress }: {
  conversation: InboxConversation; index: number; onPress: () => void; onLongPress?: () => void;
}) {
  const { colors, fontSizes, showAvatars, animation, isUserOnline } = useTheme();
  const online = !conversation.isGroup && isUserOnline(conversation.userId);
  const showUnread = conversation.unreadCount > 0 && !conversation.muted;

  return (
    <Animated.View entering={animation(FadeIn.delay(index * 20).duration(80))}>
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
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
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{conversation.unreadCount}</Text>
              </Animated.View>
            )}
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              flexShrink: 1,
              fontWeight: '600', fontSize: fontSizes.body,
              color: showUnread ? colors.text : colors.textSecondary,
            }} numberOfLines={1}>
              {conversation.displayName}
            </Text>
            {conversation.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            {conversation.muted && <BellSlash color={colors.textMuted} size={13} weight="fill" />}
            {conversation.isGroup && <Users color={colors.textMuted} size={13} weight="fill" />}
            {online && <Text style={{ color: colors.success, fontSize: fontSizes.caption }}>online</Text>}
          </View>
          <Text
            style={{
              fontSize: fontSizes.small, marginTop: 2,
              color: showUnread ? colors.textSecondary : colors.textMuted,
              fontWeight: showUnread ? '500' : '400',
            }}
            numberOfLines={1}
          >
            {conversation.isGroup && conversation.memberCount
              ? `${conversation.memberCount} members · ${conversation.lastMessage}`
              : conversation.lastMessage}
          </Text>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginLeft: 8 }}>
          {getTimeAgo(conversation.lastMessageAt)}
        </Text>
      </AnimatedPressable>
    </Animated.View>
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
        isGroup: rc.isGroup,
        memberCount: rc.memberCount,
      }))
    : localConversations;

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
  const active = sorted.filter(c => !c.archived);
  const archived = sorted.filter(c => c.archived);

  const openActions = (c: InboxConversation) => {
    if (!remote) return;
    Alert.alert(c.displayName, undefined, [
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

  const renderCard = (item: InboxConversation, index: number) => (
    <ConversationCard
      conversation={item}
      index={index}
      onPress={() => router.push(`/messages/${item.id}`)}
      onLongPress={() => openActions(item)}
    />
  );

  if (remote && remoteLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AnimatedPressable onPress={() => router.back()} className="p-1" scaleValue={0.88} haptic="light">
            <ArrowLeft color={colors.text} size={24} />
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>Messages</Text>
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} className="p-1" scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>Messages</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AnimatedPressable onPress={() => setGroupModalOpen(true)} className="p-1" scaleValue={0.88} haptic="light">
            <Users color={colors.accent} size={22} weight="bold" />
          </AnimatedPressable>
          <AnimatedPressable onPress={() => router.push('/(tabs)/explore')} className="p-1" scaleValue={0.88} haptic="light">
            <PencilSimple color={colors.accent} size={22} />
          </AnimatedPressable>
        </View>
      </View>

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={<Envelope color="#6366F1" size={32} />}
          title="No messages yet"
          subtitle="Start a conversation by visiting someone's profile and tapping the message button."
          actionLabel="Find people"
          onAction={() => router.push('/(tabs)/explore')}
        />
      ) : (
        <FlashList
          data={active}
          renderItem={({ item, index }) => renderCard(item, index)}
          keyExtractor={item => item.id}
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
                    Archived · {archived.length}
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
          ) : null}
        />
      )}
      <CreateGroupModal
        visible={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreated={conversationId => router.push(`/messages/${conversationId}`)}
      />
    </SafeAreaView>
  );
}
