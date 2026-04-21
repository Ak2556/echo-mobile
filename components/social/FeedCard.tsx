import React, { useState } from 'react';
import { View, Text, Share, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LikeButton } from './LikeButton';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { MessageCircle, Bookmark, Repeat2, Share2, BadgeCheck, MoreHorizontal, Flag, UserX, Play, BarChart2 } from 'lucide-react-native';
import Animated, { FadeInUp, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withSequence, Layout, withTiming } from 'react-native-reanimated';
import { FeedItem, Poll } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { useToggleRemoteBookmark } from '../../hooks/queries/useSupabaseSocial';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onPress?: () => void;
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function PollBar({ pct }: { pct: number }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withTiming(pct, { duration: 500 });
  }, [pct]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: 'rgba(99,102,241,0.4)' }, style]} />;
}

interface PollViewProps {
  poll: Poll;
  echoId: string;
  votePoll: (echoId: string, optionId: string) => void;
  colors: any;
  radius: any;
  fontSizes: any;
}

function PollView({ poll, echoId, votePoll, colors, radius, fontSizes }: PollViewProps) {
  const isExpired = poll.endsAt ? new Date(poll.endsAt) < new Date() : false;
  const hasVoted = !!poll.userVote || isExpired;

  const getTimeLeft = () => {
    if (!poll.endsAt) return null;
    const ms = new Date(poll.endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h left`;
    return `${Math.floor(hrs / 24)}d left`;
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {poll.options.map(opt => {
        const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
        const isWinner = hasVoted && opt.votes === Math.max(...poll.options.map(o => o.votes)) && opt.votes > 0;
        const isVoted = poll.userVote === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => { if (!hasVoted) votePoll(echoId, opt.id); }}
            style={{
              marginBottom: 8, borderRadius: radius.md, overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: isVoted ? colors.accent : isWinner ? colors.accent + '66' : colors.border,
              backgroundColor: colors.surfaceHover,
            }}
          >
            {hasVoted && <PollBar pct={pct} />}
            <View style={{ position: hasVoted ? 'absolute' : 'relative', inset: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ color: isVoted ? colors.accent : colors.text, fontWeight: isVoted ? '700' : '500', fontSize: fontSizes.body, flex: 1 }}>{opt.text}</Text>
              {hasVoted && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginLeft: 8 }}>{pct}%</Text>}
            </View>
          </Pressable>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <BarChart2 color={colors.textMuted} size={12} />
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
          {getTimeLeft() ? ` · ${getTimeLeft()}` : ''}
        </Text>
      </View>
    </View>
  );
}

export function FeedCard({ item, index, onPress }: FeedCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const remoteBm = useToggleRemoteBookmark();
  const { colors, radius, fontSizes, reduceAnimations, showAvatars } = useTheme();
  const { isBookmarked, toggleBookmark, isReposted, toggleRepost,
    compactFeed, showPreviewCards, votePoll,
  } = useAppStore();
  const bookmarked = remote ? item.isBookmarked : isBookmarked(item.id);
  const reposted = isReposted(item.id);
  const [showMenu, setShowMenu] = useState(false);

  const bookmarkScale = useSharedValue(1);
  const repostScale = useSharedValue(1);
  const shareScale = useSharedValue(1);

  const bookmarkAnim = useAnimatedStyle(() => ({ transform: [{ scale: bookmarkScale.value }] }));
  const repostAnim = useAnimatedStyle(() => ({ transform: [{ scale: repostScale.value }] }));
  const shareAnim = useAnimatedStyle(() => ({ transform: [{ scale: shareScale.value }] }));

  const bounceIcon = (sv: { value: number }) => {
    if (reduceAnimations) return;
    sv.value = withSequence(
      withSpring(0.7, { damping: 10, stiffness: 400 }),
      withSpring(1.15, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 300 })
    );
  };

  const toggleBookmarkPress = () => {
    bounceIcon(bookmarkScale);
    if (remote) {
      remoteBm.mutate({ echoId: item.id, bookmark: !bookmarked });
      showToast(!bookmarked ? 'Bookmarked' : 'Removed bookmark', !bookmarked ? '\u{1F516}' : '');
      return;
    }
    toggleBookmark(item.id);
    qc.invalidateQueries({ queryKey: ['feed'] });
    showToast(!bookmarked ? 'Bookmarked' : 'Removed bookmark', !bookmarked ? '\u{1F516}' : '');
  };

  const handleRepost = () => {
    bounceIcon(repostScale);
    toggleRepost(item.id);
    showToast(!reposted ? 'Re-echoed!' : 'Removed re-echo', !reposted ? '\u{1F501}' : '');
  };

  const handleNativeShare = async () => {
    bounceIcon(shareScale);
    try {
      await Share.share({
        message: `"${item.prompt}"\n\nEcho: ${item.response}\n\n\u2014 @${item.username} on Echo`,
      });
    } catch {}
  };

  const handleReport = () => {
    setShowMenu(false);
    router.push({ pathname: '/report', params: { targetType: 'echo', targetId: item.id, targetName: item.username } });
  };

  const entering = reduceAnimations
    ? FadeIn.duration(150)
    : FadeInUp.delay(Math.min(index, 5) * 60).springify();

  const textSize = fontSizes.body;
  const cardPadding = compactFeed ? 12 : 16;

  return (
    <Animated.View entering={entering} layout={reduceAnimations ? undefined : Layout.springify()}>
      <AnimatedPressable
        onPress={onPress}
        scaleValue={reduceAnimations ? 1 : 0.98}
        haptic="light"
        style={{
          backgroundColor: colors.surface,
          marginHorizontal: 16,
          marginVertical: 6,
          padding: cardPadding,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {/* Repost badge */}
        {item.repostedByUsername && (
          <View className="flex-row items-center mb-2 ml-1 gap-1.5">
            <Repeat2 color={colors.textMuted} size={13} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.repostedByUsername} re-echoed</Text>
          </View>
        )}

        {/* Author row */}
        <View className={`flex-row items-center ${compactFeed ? 'mb-2' : 'mb-3'}`}>
          {showAvatars && (
            <AnimatedPressable
              onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
              scaleValue={reduceAnimations ? 1 : 0.9}
              haptic="light"
            >
              <View
                className={`${compactFeed ? 'w-7 h-7' : 'w-9 h-9'} rounded-full items-center justify-center mr-3`}
                style={{ backgroundColor: item.avatarColor || colors.accent }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                  {(item.displayName || item.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
            className="flex-1"
            scaleValue={reduceAnimations ? 1 : 0.98}
            haptic="none"
          >
            <View className="flex-row items-center gap-1">
              <Text style={{ fontSize: textSize, color: colors.text, fontWeight: '600' }}>{item.displayName || item.username}</Text>
              {item.isVerified && <BadgeCheck color={colors.accent} size={14} fill={colors.accent} />}
            </View>
            {!compactFeed && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>}
          </AnimatedPressable>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); setShowMenu(!showMenu); }}
            scaleValue={reduceAnimations ? 1 : 0.85}
            haptic="light"
          >
            <MoreHorizontal color={colors.textMuted} size={18} />
          </AnimatedPressable>
        </View>

        {/* Menu */}
        {showMenu && (
          <Animated.View
            entering={reduceAnimations ? undefined : FadeIn.duration(200)}
            exiting={reduceAnimations ? undefined : FadeOut.duration(150)}
            className="mb-3 overflow-hidden"
            style={{
              borderRadius: radius.md,
              backgroundColor: colors.surfaceHover,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AnimatedPressable onPress={handleReport} className="flex-row items-center px-4 py-2.5 gap-2.5" scaleValue={0.97} haptic="medium">
              <Flag color="#F59E0B" size={14} />
              <Text style={{ color: colors.text, fontSize: fontSizes.small }}>Report</Text>
            </AnimatedPressable>
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
            <AnimatedPressable
              onPress={() => { setShowMenu(false); router.push(`/user/${item.userId}`); }}
              className="flex-row items-center px-4 py-2.5 gap-2.5"
              scaleValue={0.97}
              haptic="light"
            >
              <UserX color={colors.textSecondary} size={14} />
              <Text style={{ color: colors.text, fontSize: fontSizes.small }}>View Profile</Text>
            </AnimatedPressable>
          </Animated.View>
        )}

        {/* ── TEXT post ── */}
        {(!item.postType || item.postType === 'text') && (
          <>
            <View
              style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.md, padding: compactFeed ? 8 : 12, marginBottom: compactFeed ? 8 : 12 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '500', fontSize: fontSizes.caption, marginBottom: 4 }}>Prompt</Text>
              <Text style={{ fontSize: textSize, color: colors.text }} numberOfLines={compactFeed ? 2 : undefined}>{item.prompt}</Text>
            </View>
            {showPreviewCards && !!item.response && (
              <View style={{ marginBottom: compactFeed ? 8 : 12 }}>
                <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontWeight: '500', marginBottom: 2 }}>Echo</Text>
                <Text style={{ fontSize: textSize, color: colors.textSecondary, lineHeight: textSize * 1.6 }} numberOfLines={compactFeed ? 2 : 3}>{item.response}</Text>
              </View>
            )}
          </>
        )}

        {/* ── PHOTO post ── */}
        {item.postType === 'photo' && (
          <View style={{ marginBottom: 12 }}>
            {/* Caption */}
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, marginBottom: 10 }} numberOfLines={compactFeed ? 1 : 3}>{item.prompt}</Text>
            )}
            {/* Image grid */}
            {item.mediaUris && item.mediaUris.length > 0 && (
              item.mediaUris.length === 1 ? (
                <View style={{ borderRadius: radius.card, overflow: 'hidden', height: 220 }}>
                  <Image source={{ uri: item.mediaUris[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {item.mediaUris.map((uri, idx) => (
                    <View key={idx} style={{ width: '48.5%', aspectRatio: item.mediaUris!.length <= 2 ? 1.4 : 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceHover }}>
                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    </View>
                  ))}
                </View>
              )
            )}
          </View>
        )}

        {/* ── VIDEO post ── */}
        {item.postType === 'video' && (
          <View style={{ marginBottom: 12 }}>
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, marginBottom: 10 }} numberOfLines={compactFeed ? 1 : 2}>{item.prompt}</Text>
            )}
            <View style={{ borderRadius: radius.card, overflow: 'hidden', height: 200, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Play color="#fff" size={26} fill="#fff" />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 10 }}>Tap to play video</Text>
            </View>
          </View>
        )}

        {/* ── POLL post ── */}
        {item.postType === 'poll' && item.poll && (
          <View style={{ marginBottom: 4 }}>
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, fontWeight: '600', marginBottom: 12 }} numberOfLines={compactFeed ? 1 : undefined}>{item.prompt}</Text>
            )}
            {!compactFeed && (
              <PollView poll={item.poll} echoId={item.id} votePoll={votePoll} colors={colors} radius={radius} fontSizes={fontSizes} />
            )}
            {compactFeed && (
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.poll.options.length} options · {item.poll.totalVotes} votes</Text>
            )}
          </View>
        )}

        {/* Hashtags */}
        {!compactFeed && item.hashtags && item.hashtags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-3">
            {item.hashtags.slice(0, 3).map(tag => (
              <Text key={tag} style={{ color: colors.accent, fontSize: fontSizes.caption }}>#{tag}</Text>
            ))}
          </View>
        )}

        {/* View count */}
        {!compactFeed && (item.viewCount ?? 0) > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 8 }}>{item.viewCount?.toLocaleString()} views</Text>
        )}

        {/* Actions */}
        <View
          className="flex-row justify-between items-center pt-3"
          style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />

          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={(e) => { e.stopPropagation?.(); router.push(`/comments/${item.id}`); }}
              className="flex-row items-center gap-1"
              scaleValue={reduceAnimations ? 1 : 0.85}
              haptic="light"
            >
              <MessageCircle color={colors.textMuted} size={17} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.commentCount || 0}</Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={(e) => { e.stopPropagation?.(); handleRepost(); }}
              className="flex-row items-center gap-1"
              scaleValue={reduceAnimations ? 1 : 0.85}
              haptic="medium"
            >
              <Animated.View style={repostAnim}>
                <Repeat2 color={reposted ? colors.success : colors.textMuted} size={17} />
              </Animated.View>
              <Text style={{ color: reposted ? colors.success : colors.textMuted, fontSize: fontSizes.caption }}>
                {(item.repostCount || 0) + (reposted ? 1 : 0)}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); toggleBookmarkPress(); }} scaleValue={reduceAnimations ? 1 : 0.85} haptic="medium">
              <Animated.View style={bookmarkAnim}>
                <Bookmark
                  color={bookmarked ? colors.accent : colors.textMuted}
                  size={17}
                  fill={bookmarked ? colors.accent : 'transparent'}
                />
              </Animated.View>
            </AnimatedPressable>

            <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); handleNativeShare(); }} scaleValue={reduceAnimations ? 1 : 0.85} haptic="light">
              <Animated.View style={shareAnim}>
                <Share2 color={colors.textMuted} size={17} />
              </Animated.View>
            </AnimatedPressable>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}
