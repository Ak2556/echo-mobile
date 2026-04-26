import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { ArrowLeft, BookmarkSimple, ShareNetwork, ChatCircle, DotsThreeOutline, PencilSimple, Trash, Flag, ChartBar } from 'phosphor-react-native';
import { LikeButton } from '../../components/social/LikeButton';
import { MediaGrid } from '../../components/social/MediaGrid';
import { InlineVideo } from '../../components/social/InlineVideo';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { useFeed } from '../../hooks/queries/useFeed';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const { data: feed } = useFeed();
  const { isBookmarked, toggleBookmark, deleteEcho, userId: currentUserId } = useAppStore();
  const { colors, radius, fontSizes, showAvatars, animation } = useTheme();
  const remoteBm = useToggleRemoteBookmark();
  const [showMenu, setShowMenu] = useState(false);

  const item = feed?.find(f => f.id === id);
  const bookmarked = remote
    ? !!item?.isBookmarked
    : id
      ? isBookmarked(id)
      : false;

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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} className="items-center justify-center">
        <Text style={{ color: colors.textSecondary }}>Echo not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text style={{ color: colors.accent }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isOwner = item.userId === currentUserId || item.userId === 'me';

  const handleDelete = () => {
    Alert.alert('Delete Echo', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => { deleteEcho(item.id); router.back(); },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 18 }}>Echo Thread</Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable onPress={toggleBm}>
            <BookmarkSimple color={bookmarked ? colors.accent : colors.textSecondary} size={22} weight="fill" />
          </Pressable>
          {isOwner && (
            <Pressable onPress={() => setShowMenu(m => !m)} style={{ padding: 2 }}>
              <DotsThreeOutline color={colors.textSecondary} size={24} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Owner actions menu */}
      {showMenu && isOwner && (
        <Animated.View
          entering={FadeIn.duration(80)}
          exiting={FadeOut.duration(120)}
          style={{
            position: 'absolute', top: 60, right: 16, zIndex: 50,
            backgroundColor: colors.surfaceHover, borderRadius: radius.card,
            borderWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            minWidth: 160,
          }}
        >
          <Pressable
            onPress={() => { setShowMenu(false); router.push({ pathname: '/edit-post' as any, params: { id: item.id } }); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}
          >
            <PencilSimple color={colors.accent} size={18} />
            <Text style={{ color: colors.text, fontSize: fontSizes.body }}>Edit Echo</Text>
          </Pressable>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }} />
          <Pressable
            onPress={() => { setShowMenu(false); handleDelete(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}
          >
            <Trash color="#EF4444" size={18} />
            <Text style={{ color: '#EF4444', fontSize: fontSizes.body }}>Delete Echo</Text>
          </Pressable>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }} />
          <Pressable
            onPress={() => { setShowMenu(false); router.push({ pathname: '/report', params: { targetType: 'echo', targetId: item.id, targetName: item.username } }); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}
          >
            <Flag color="#F59E0B" size={15} />
            <Text style={{ color: colors.text, fontSize: fontSizes.body }}>Report</Text>
          </Pressable>
        </Animated.View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Animated.View entering={animation(FadeInDown.delay(100).springify())} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          {showAvatars && (
            <Pressable onPress={() => router.push(`/user/${item.userId}`)}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.title * 0.9 }}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
            </Pressable>
          )}
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.title }}>{item.displayName || item.username}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>@{item.username}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={animation(FadeInDown.delay(200).springify())} style={{ padding: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: fontSizes.small, marginBottom: 8 }}>
            {item.postType === 'poll' ? 'Poll' : 'Prompt'}
          </Text>
          <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.prompt}</Text>
        </Animated.View>

        {/* Photo grid */}
        {item.postType === 'photo' && item.mediaUris && item.mediaUris.length > 0 && (
          <Animated.View entering={animation(FadeInDown.delay(250).springify())} style={{ marginBottom: 12 }}>
            <MediaGrid uris={item.mediaUris} />
          </Animated.View>
        )}

        {/* Video */}
        {item.postType === 'video' && item.videoUri && (
          <Animated.View entering={animation(FadeInDown.delay(250).springify())}>
            <InlineVideo
              uri={item.videoUri}
              height={300}
              qualities={item.videoQualities}
            />
          </Animated.View>
        )}

        {/* Poll */}
        {item.postType === 'poll' && item.poll && (
          <Animated.View entering={animation(FadeInDown.delay(250).springify())} style={{ marginBottom: 12 }}>
            <ThreadPollView poll={item.poll} echoId={item.id} colors={colors} radius={radius} fontSizes={fontSizes} />
          </Animated.View>
        )}

        {/* Response (text posts only) */}
        {(item.postType === 'text' || !item.postType) && !!item.response && (
          <Animated.View entering={animation(FadeInDown.delay(300).springify())} style={{ padding: 16, marginBottom: 20, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.accentMuted }}>
            <Text style={{ color: colors.accent, fontWeight: '600', fontSize: fontSizes.small, marginBottom: 8 }}>Echo</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.6 }}>{item.response}</Text>
          </Animated.View>
        )}

        <Animated.View entering={animation(FadeInDown.delay(400).springify())} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => id && router.push(`/comments/${id}`)}
              style={{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.surface }}
            >
              <ChatCircle color={colors.textSecondary} size={20} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small }}>{item.commentCount ?? 0}</Text>
            </Pressable>
            <Pressable onPress={toggleBm} style={{ padding: 8, borderRadius: radius.full, backgroundColor: colors.surface }}>
              <BookmarkSimple color={bookmarked ? colors.accent : colors.textSecondary} size={20} weight="fill" />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/share', params: { prompt: item.prompt, response: item.response } })}
              style={{ padding: 8, borderRadius: radius.full, backgroundColor: colors.surface }}
            >
              <ShareNetwork color={colors.textSecondary} size={22} />
            </Pressable>
          </View>
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
            style={{
              marginBottom: 10, borderRadius: radius.md, overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: isVoted ? colors.accent : colors.border,
              backgroundColor: colors.surfaceHover,
              minHeight: 46,
            }}
          >
            {hasVoted && (
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: 'rgba(99,102,241,0.3)', borderRadius: radius.md }} />
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: isVoted ? colors.accent : colors.text, fontWeight: isVoted ? '700' : '500', fontSize: fontSizes.body, flex: 1 }}>{opt.text}</Text>
              {hasVoted && <Text style={{ color: colors.textMuted, fontSize: fontSizes.small, marginLeft: 8 }}>{pct}%</Text>}
            </View>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <ChartBar color={colors.textMuted} size={15} />
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
          {poll.endsAt && !isExpired ? ` · ${Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 3600000)}h left` : ''}
          {isExpired ? ' · Ended' : ''}
        </Text>
      </View>
    </View>
  );
}
