import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookmarkSimple, ChatCircle, DotsThreeOutline, Flag, NotePencil, PaperPlaneTilt, ShareNetwork, Sparkle, Trash } from 'phosphor-react-native';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { LikeButton } from '../../components/social/LikeButton';
import { MediaGrid } from '../../components/social/MediaGrid';
import { InlineVideo } from '../../components/social/InlineVideo';
import { SimilarEchoesRail } from '../../components/social/SimilarEchoesRail';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';
import { inferTopics } from '../../lib/echoUX';

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const { data: feed = [] } = useFeed();
  const { isBookmarked, toggleBookmark, deleteEcho, userId: currentUserId, getOrCreateConversation } = useAppStore();
  const { colors, radius, fontSizes, showAvatars } = useTheme();
  const remoteBm = useToggleRemoteBookmark();
  const [showMenu, setShowMenu] = useState(false);

  const item = feed.find(f => f.id === id);
  const bookmarked = remote ? !!item?.isBookmarked : id ? isBookmarked(id) : false;

  const relatedEchoes = useMemo(() => {
    if (!item) return [];
    const itemTopics = inferTopics(item).map(topic => topic.toLowerCase());
    return feed
      .filter(entry => entry.id !== item.id && inferTopics(entry).some(topic => itemTopics.includes(topic.toLowerCase())))
      .slice(0, 3);
  }, [feed, item]);

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
        <Text style={{ color: colors.textSecondary }}>Echo not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.accent }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isOwner = item.userId === currentUserId || item.userId === 'me';

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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>Echo Thread</Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable onPress={toggleBm}>
            <BookmarkSimple color={bookmarked ? colors.accent : colors.textSecondary} size={22} weight="fill" />
          </Pressable>
          {isOwner ? (
            <Pressable onPress={() => setShowMenu(value => !value)} style={{ padding: 2 }}>
              <DotsThreeOutline color={colors.textSecondary} size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isOwner && (() => {
        const menuActions: ActionItem[] = [
          {
            key: 'edit',
            label: 'Edit Echo',
            icon: <NotePencil color={colors.accent} size={18} />,
            onPress: () => router.push({ pathname: '/edit-post' as any, params: { id: item.id } }),
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          {showAvatars ? (
            <Pressable onPress={() => router.push(`/user/${item.userId}`)}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.title * 0.9 }}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>{item.displayName || item.username}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
          </Pressable>
        </View>

        <View style={{ padding: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 10 }}>
            {item.editorialTitle || item.prompt}
          </Text>
          {item.authorNote ? (
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.45, marginBottom: 12 }}>
              {item.authorNote}
            </Text>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: fontSizes.small, marginBottom: 8 }}>
            {item.postType === 'poll' ? 'Poll prompt' : 'Original prompt'}
          </Text>
          <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.prompt}</Text>
        </View>

        {(item.conversationContext || (item.topicLabels?.length ?? 0) > 0 || inferTopics(item).length > 0) ? (
          <View style={{ padding: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
            {item.conversationContext ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Sparkle color={colors.accent} size={16} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>How this Echo was framed</Text>
                </View>
                <Text style={{ color: colors.textSecondary, lineHeight: 20, marginBottom: 12 }}>{item.conversationContext}</Text>
              </>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(item.topicLabels?.length ? item.topicLabels : inferTopics(item)).slice(0, 4).map(topic => (
                <View key={topic} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.accentMuted }}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>#{topic}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {item.postType === 'photo' && item.mediaUris && item.mediaUris.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <MediaGrid uris={item.mediaUris} />
          </View>
        ) : null}

        {item.postType === 'video' && item.videoUri ? (
          <View style={{ marginBottom: 12 }}>
            <InlineVideo uri={item.videoUri} height={300} qualities={item.videoQualities} />
          </View>
        ) : null}

        {item.postType === 'poll' && item.poll ? (
          <ThreadPollView poll={item.poll} echoId={item.id} colors={colors} radius={radius} fontSizes={fontSizes} />
        ) : null}

        {(item.postType === 'text' || !item.postType) && !!item.response ? (
          <View style={{ padding: 16, marginTop: 12, marginBottom: 18, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.accentMuted }}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSizes.small, marginBottom: 8 }}>Echo takeaway</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.response}</Text>
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

        {!isOwner ? (
          <Pressable
            onPress={handleMessageAboutEcho}
            style={{ marginTop: 18, paddingVertical: 14, borderRadius: radius.card, backgroundColor: colors.accent, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <PaperPlaneTilt color="#fff" size={18} />
            <Text style={{ color: '#fff', fontWeight: '800' }}>Message about this Echo</Text>
          </Pressable>
        ) : null}

        <SimilarEchoesRail echoId={item.id} />

        {relatedEchoes.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
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
