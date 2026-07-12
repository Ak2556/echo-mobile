import React, { useState } from 'react';
import { StyleSheet, View, Text, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { ArrowLeft, PencilSimple, Envelope, SealCheck, BellSlash, Archive, CaretDown, CaretRight } from 'phosphor-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { EmptyState } from '../../components/common/EmptyState';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { Conversation } from '../../types';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useRemoteConversations, useSetDMPref } from '../../hooks/queries/useDMs';
import { usePresenceTracking } from '../../lib/presence';
import { FeedCardSkeleton } from '../../components/ui/Skeleton';
import { RemoteConversation } from '../../lib/supabaseEchoApi';

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

type InboxConversation = Conversation & { muted?: boolean; archived?: boolean };

function ConversationCard({ conversation, index, onPress, onLongPress }: {
  conversation: InboxConversation; index: number; onPress: () => void; onLongPress?: () => void;
}) {
  const { colors, fontSizes, showAvatars, animation, isUserOnline } = useTheme();
  const online = isUserOnline(conversation.userId);
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
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: conversation.avatarColor,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.title * 0.9 }}>
                {conversation.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            {online && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: colors.success,
                  borderWidth: 2,
                  borderColor: colors.bg,
                }}
              />
            )}
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
            {conversation.lastMessage}
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

  // Resolve conversations: use remote when available, local only in non-remote mode
  const conversations: InboxConversation[] = remote
    ? remoteConvs.map((rc: RemoteConversation) => ({
        id: rc.id,
        userId: rc.otherUserId,
        username: rc.otherUsername,
        displayName: rc.otherDisplayName,
        avatarColor: rc.otherAvatarColor,
        isVerified: false,
        lastMessage: rc.lastMessage ?? '',
        lastMessageAt: rc.lastMessageAt ?? new Date().toISOString(),
        unreadCount: rc.unreadCount,
        muted: rc.muted,
        archived: rc.archived,
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
          <AnimatedPressable onPress={() => router.push('/(tabs)/explore')} className="p-1" scaleValue={0.88} haptic="light">
            <PencilSimple color={colors.accent} size={22} />
          </AnimatedPressable>
        </View>
        <FeedCardSkeleton />
        <FeedCardSkeleton />
        <FeedCardSkeleton />
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
        <AnimatedPressable onPress={() => router.push('/(tabs)/explore')} className="p-1" scaleValue={0.88} haptic="light">
          <PencilSimple color={colors.accent} size={22} />
        </AnimatedPressable>
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
    </SafeAreaView>
  );
}
