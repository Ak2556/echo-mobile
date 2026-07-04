import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookmarkSimple, ChatCircle, Compass, DotsThreeOutline, Flag, GitBranch, NotePencil, PaperPlaneTilt, PushPin, PushPinSlash, ShareNetwork, Trash } from 'phosphor-react-native';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { ConnectionPanel } from '../../components/common/ConnectionPanel';
import { fetchRemoteEchoById, setPinnedEcho } from '../../lib/supabaseEchoApi';
import { showToast } from '../../components/ui/Toast';
import { LikeButton } from '../../components/social/LikeButton';
import { MediaGrid } from '../../components/social/MediaGrid';
import { InlineVideo } from '../../components/social/InlineVideo';
import { SimilarEchoesRail } from '../../components/social/SimilarEchoesRail';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';
import { useRemoteProfileBundle } from '../../hooks/queries/useRemoteProfile';
import { inferTopics } from '../../lib/echoUX';

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const { data: feed = [] } = useFeed();
  const { isBookmarked, toggleBookmark, deleteEcho, userId: currentUserId, getOrCreateConversation } = useAppStore();
  const { colors, radius, fontSizes, showAvatars, font } = useTheme();
  const remoteBm = useToggleRemoteBookmark();
  const [showMenu, setShowMenu] = useState(false);
  // Pull the owner's profile to know whether THIS echo is currently their pin.
  const ownProfile = useRemoteProfileBundle(remote ? currentUserId : undefined);
  const myPinnedId = ownProfile.data?.pinnedEcho?.id ?? null;

  // The feed cache only holds the current feed page; items reached from the
  // trending rail, notifications, or deep links may not be in it. Fall back
  // to a by-id fetch so every echo route resolves.
  const cachedItem = feed.find(f => f.id === id);
  const { data: fetchedItem, isLoading: fetchingItem } = useQuery({
    queryKey: ['echo', id],
    queryFn: () => fetchRemoteEchoById(id!),
    enabled: remote && !cachedItem && !!id,
    staleTime: 60_000,
  });
  const item = cachedItem ?? fetchedItem ?? undefined;
  const bookmarked = remote ? !!item?.isBookmarked : id ? isBookmarked(id) : false;

  const relatedEchoes = useMemo(() => {
    if (!item) return [];
    const itemTopics = inferTopics(item).map(topic => topic.toLowerCase());
    return feed
      .filter(entry => entry.id !== item.id && inferTopics(entry).some(topic => itemTopics.includes(topic.toLowerCase())))
      .slice(0, 3);
  }, [feed, item]);
  const visibleTopics = useMemo(
    () => item ? (item.topicLabels?.length ? item.topicLabels : inferTopics(item)).slice(0, 4) : [],
    [item],
  );

  const toggleBm = () => {
    if (!id) return;
    if (remote) {
      remoteBm.mutate({ echoId: id, bookmark: !bookmarked });
      return;
    }
    toggleBookmark(id);
    qc.invalidateQueries({ queryKey: ['feed'] });
  };

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        {fetchingItem ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <>
            <Text style={{ color: colors.textSecondary }}>Echo not found</Text>
            <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
              <Text style={{ color: colors.accent }}>Go back</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    );
  }

  const isOwner = item.userId === currentUserId || item.userId === 'me';
  const primaryTopic = visibleTopics[0];

  const handleDelete = () => {
    Alert.alert('Delete Echo', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteEcho(item.id); router.back(); } },
    ]);
  };

  const handleMessageAboutEcho = () => {
    const user = {
      id: item.userId,
      username: item.username,
      displayName: item.displayName,
      avatarColor: item.avatarColor,
      avatarUrl: item.avatarUrl,
      bio: '',
      isVerified: item.isVerified,
      followerCount: 0,
      followingCount: 0,
      echoCount: 0,
      createdAt: item.createdAt,
    };
    const conversationId = getOrCreateConversation(user);
    router.push({
      pathname: '/messages/[id]',
      params: {
        id: conversationId,
        echoId: item.id,
        echoTitle: item.editorialTitle || item.prompt,
        echoPreview: item.authorNote || item.response || item.prompt,
        echoAuthor: item.displayName || item.username,
      },
    });
  };

  const connectionActions = [
    {
      key: 'comments',
      label: `Comments (${item.commentCount ?? 0})`,
      icon: <ChatCircle color={colors.textSecondary} size={18} />,
      onPress: () => router.push(`/comments/${item.id}`),
    },
    {
      key: 'perspective',
      label: 'Add perspective',
      icon: <GitBranch color={colors.textSecondary} size={18} weight="bold" />,
      onPress: () => router.push({
        pathname: '/remix/[id]',
        params: { id: item.id, author: item.username, parentTitle: item.editorialTitle || item.prompt },
      }),
      emphasis: 'primary' as const,
    },
    {
      key: 'quote',
      label: 'Quote',
      icon: <NotePencil color={colors.textSecondary} size={18} />,
      onPress: () => router.push({ pathname: '/create-post', params: { quoted: item.id } }),
    },
    ...(primaryTopic ? [{
      key: 'topic',
      label: `Explore #${primaryTopic}`,
      icon: <Compass color={colors.textSecondary} size={18} />,
      onPress: () => router.push({ pathname: '/(tabs)/explore', params: { q: primaryTopic } }),
    }] : []),
    ...(!isOwner ? [{
      key: 'message',
      label: 'Message author',
      icon: <PaperPlaneTilt color={colors.textSecondary} size={18} />,
      onPress: handleMessageAboutEcho,
    }] : []),
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 19, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.4 }}>Echo Thread</Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {/* Bookmark stays only in the action row below the post body.
              The header version was duplicate weight for the same action. */}
          {isOwner ? (
            <Pressable
              onPress={() => setShowMenu(value => !value)}
              style={{ padding: 2 }}
              accessibilityRole="button"
              accessibilityLabel="Post options"
              accessibilityHint="Opens edit, delete, and report menu"
            >
              <DotsThreeOutline color={colors.textSecondary} size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isOwner && (() => {
        const isPinned = myPinnedId === item.id;
        const menuActions: ActionItem[] = [
          {
            key: 'pin',
            label: isPinned ? 'Unpin from profile' : 'Pin to profile',
            icon: isPinned
              ? <PushPinSlash color={colors.textSecondary} size={18} weight="bold" />
              : <PushPin color={colors.accent} size={18} weight="fill" />,
            onPress: async () => {
              try {
                await setPinnedEcho(isPinned ? null : item.id);
                showToast(isPinned ? 'Unpinned' : 'Pinned to your profile', isPinned ? '' : 'Pinned');
                qc.invalidateQueries({ queryKey: ['profile', currentUserId] });
              } catch (e: any) {
                showToast(e?.message || 'Could not update pin', 'Error');
              }
            },
          },
          {
            key: 'edit',
            label: 'Edit Echo',
            icon: <NotePencil color={colors.accent} size={18} />,
            onPress: () => router.push({ pathname: '/edit-post', params: { id: item.id } }),
          },
          {
            key: 'delete',
            label: 'Delete Echo',
            icon: <Trash color="#EF4444" size={18} />,
            destructive: true,
            onPress: handleDelete,
          },
          {
            key: 'report',
            label: 'Report',
            icon: <Flag color="#F59E0B" size={18} weight="fill" />,
            destructive: true,
            onPress: () => router.push({ pathname: '/report', params: { targetType: 'echo', targetId: item.id, targetName: item.username } }),
          },
        ];
        return <ActionSheet visible={showMenu} onClose={() => setShowMenu(false)} subtitle={item.editorialTitle || item.prompt} actions={menuActions} />;
      })()}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
        {/* Entrance choreography: the screen lifts in (fade_from_bottom on
            the stack), then media settles first and the article staggers
            in beneath it — reads as continuity from the tapped feed card. */}
        {item.postType === 'photo' && item.mediaUris && item.mediaUris.length > 0 ? (
          <Animated.View entering={FadeIn.duration(260)} style={{ marginBottom: 18, marginHorizontal: -8, borderRadius: 22, overflow: 'hidden' }}>
            <MediaGrid uris={item.mediaUris} />
          </Animated.View>
        ) : null}
        {item.postType === 'video' && item.videoUri ? (
          <Animated.View entering={FadeIn.duration(260)} style={{ marginBottom: 18, marginHorizontal: -8, borderRadius: 22, overflow: 'hidden' }}>
            <InlineVideo uri={item.videoUri} height={340} qualities={item.videoQualities} />
          </Animated.View>
        ) : null}

        <Animated.Text
          entering={FadeInDown.delay(60).duration(300).springify().damping(18)}
          style={[font.displayBlack, { color: colors.text, fontSize: 27, lineHeight: 35, marginBottom: 16 }]}
        >
          {item.editorialTitle || item.prompt}
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(120).duration(300).springify().damping(18)}>
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            {showAvatars ? (
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small, fontFamily: 'Inter_600SemiBold' }}>{item.displayName || item.username}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(170).duration(320).springify().damping(18)}>
        {item.authorNote ? (
          <Text style={{ color: colors.text, fontSize: fontSizes.body + 1, lineHeight: Math.round((fontSizes.body + 1) * 1.6), marginBottom: 20, fontFamily: 'Inter_400Regular' }}>
            {item.authorNote}
          </Text>
        ) : null}
        {item.editorialTitle && item.editorialTitle !== item.prompt ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter_600SemiBold' }}>
              {item.postType === 'poll' ? 'Poll prompt' : 'Prompt'}
            </Text>
            <Text style={[font.quote, { color: colors.textSecondary, fontSize: fontSizes.body + 1, lineHeight: Math.round((fontSizes.body + 1) * 1.6) }]}>{item.prompt}</Text>
          </View>
        ) : null}

        {(item.conversationContext || (item.topicLabels?.length ?? 0) > 0 || inferTopics(item).length > 0) ? (
          <View style={{ marginBottom: 20 }}>
            {item.conversationContext ? (
              <Text style={{ color: colors.textSecondary, lineHeight: 21, marginBottom: 12 }}>{item.conversationContext}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {visibleTopics.map(topic => (
                <Pressable
                  key={topic}
                  onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: topic } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Explore ${topic}`}
                >
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>#{topic}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {item.postType === 'poll' && item.poll ? (
          <ThreadPollView poll={item.poll} echoId={item.id} colors={colors} radius={radius} fontSizes={fontSizes} />
        ) : null}

        {(item.postType === 'text' || !item.postType) && !!item.response ? (
          <View style={{ marginTop: 4, marginBottom: 22, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: colors.accent }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter_600SemiBold' }}>Takeaway</Text>
            <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.response}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => id && router.push(`/comments/${id}`)} style={{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.surface }}>
              <ChatCircle color={colors.textSecondary} size={20} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{item.commentCount ?? 0}</Text>
            </Pressable>
            <Pressable onPress={toggleBm} style={{ padding: 8, borderRadius: radius.full, backgroundColor: colors.surface }}>
              <BookmarkSimple color={bookmarked ? colors.accent : colors.textSecondary} size={20} weight="fill" />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/share', params: { prompt: item.prompt, response: item.response } })} style={{ padding: 8, borderRadius: radius.full, backgroundColor: colors.surface }}>
              <ShareNetwork color={colors.textSecondary} size={22} />
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <ConnectionPanel actions={connectionActions} />
        </View>

        <SimilarEchoesRail echoId={item.id} />

        {relatedEchoes.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>
              Related Echoes
            </Text>
            {relatedEchoes.map(related => (
              <Pressable
                key={related.id}
                onPress={() => router.push(`/thread/${related.id}`)}
                style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{related.editorialTitle || related.prompt}</Text>
                <Text style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 20 }} numberOfLines={2}>
                  {related.authorNote || related.response || related.prompt}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ThreadPollView({ poll, echoId, colors, radius, fontSizes }: { poll: any; echoId: string; colors: any; radius: any; fontSizes: any }) {
  const { votePoll } = useAppStore();
  const isExpired = poll.endsAt ? new Date(poll.endsAt) < new Date() : false;
  const hasVoted = !!poll.userVote || isExpired;

  return (
    <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
      {poll.options.map((opt: any) => {
        const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
        const isVoted = poll.userVote === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => { if (!hasVoted) votePoll(echoId, opt.id); }}
            style={{ marginBottom: 10, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: isVoted ? colors.accent : colors.border, backgroundColor: colors.surfaceHover, minHeight: 46 }}
          >
            {hasVoted ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: 'rgba(99,102,241,0.3)', borderRadius: radius.md }} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: isVoted ? colors.accent : colors.text, fontWeight: isVoted ? '700' : '500', fontSize: fontSizes.body, flex: 1 }}>{opt.text}</Text>
              {hasVoted ? <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginLeft: 8 }}>{pct}%</Text> : null}
            </View>
          </Pressable>
        );
      })}
      <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
        {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
        {poll.endsAt && !isExpired ? ` · ${Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 3600000)}h left` : ''}
        {isExpired ? ' · Ended' : ''}
      </Text>
    </View>
  );
}
