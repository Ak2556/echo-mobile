import React, { useState } from 'react';
import { View, Text, Share, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaGrid } from './MediaGrid';
import { InlineVideo } from './InlineVideo';
import { LikeButton } from './LikeButton';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { ChatCircle, BookmarkSimple, ArrowsClockwise, ShareNetwork, SealCheck, DotsThreeOutline, Flag, UserMinus, ChartBar, DownloadSimple } from 'phosphor-react-native';
import * as MediaLibrary from 'expo-media-library';
import Animated, { FadeInUp, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withSequence, Layout, withTiming } from 'react-native-reanimated';
import { FeedItem, Poll } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme, ThemeColors } from '../../lib/theme';
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

type FontSizes = ReturnType<typeof useTheme>['fontSizes'];
type Radius = ReturnType<typeof useTheme>['radius'];

interface PollViewProps {
  poll: Poll;
  echoId: string;
  votePoll: (echoId: string, optionId: string) => void;
  colors: ThemeColors;
  radius: Radius;
  fontSizes: FontSizes;
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
        <ChartBar color={colors.textMuted} size={14} />
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}
          {getTimeLeft() ? ` · ${getTimeLeft()}` : ''}
        </Text>
      </View>
    </View>
  );
}

function FeedCardInner({ item, index, onPress }: FeedCardProps) {
  const router = useRouter();
  const remote = isSupabaseRemote();
  const remoteBm = useToggleRemoteBookmark();
  const { colors, radius, fontSizes, reduceAnimations, showAvatars } = useTheme();
  // Granular selectors — each only triggers re-render when its own slice changes
  const isBookmarked    = useAppStore(s => s.isBookmarked);
  const toggleBookmark  = useAppStore(s => s.toggleBookmark);
  const isReposted      = useAppStore(s => s.isReposted);
  const toggleRepost    = useAppStore(s => s.toggleRepost);
  const compactFeed     = useAppStore(s => s.compactFeed);
  const showPreviewCards = useAppStore(s => s.showPreviewCards);
  const votePoll        = useAppStore(s => s.votePoll);
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
    // No feed invalidation — useFeed's select() applies bookmarkedIds reactively
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

  const handleSavePhotos = async () => {
    setShowMenu(false);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      showToast('Permission required to save photos', '🔒');
      return;
    }
    try {
      await Promise.all((item.mediaUris ?? []).map(uri => MediaLibrary.saveToLibraryAsync(uri)));
      showToast(`${(item.mediaUris ?? []).length} photo(s) saved`, '✅');
    } catch {
      showToast('Failed to save photos', '❌');
    }
  };

  const entering = reduceAnimations
    ? FadeIn.duration(150)
    : FadeInUp.delay(Math.min(index, 5) * 60).springify();

  const textSize = fontSizes.body;
  const cardPadding = compactFeed ? 12 : 16;

  const isHero =
    (item.postType === 'photo' && (item.mediaUris?.length ?? 0) > 0) ||
    (item.postType === 'video' && !!item.videoUri);

  const heroRadius = radius.card + 4;

  // ── Shared sub-sections ──

  const MenuOverlay = showMenu ? (
    <Animated.View
      entering={reduceAnimations ? undefined : FadeIn.duration(200)}
      exiting={reduceAnimations ? undefined : FadeOut.duration(150)}
      style={{
        marginBottom: 12,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceHover,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <AnimatedPressable onPress={handleReport} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }} scaleValue={0.97} haptic="medium">
        <Flag color="#F59E0B" size={16} weight="fill" />
        <Text style={{ color: colors.text, fontSize: fontSizes.small }}>Report</Text>
      </AnimatedPressable>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
      <AnimatedPressable
        onPress={() => { setShowMenu(false); router.push(`/user/${item.userId}`); }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}
        scaleValue={0.97}
        haptic="light"
      >
        <UserMinus color={colors.textSecondary} size={16} />
        <Text style={{ color: colors.text, fontSize: fontSizes.small }}>View Profile</Text>
      </AnimatedPressable>
      {item.postType === 'photo' && (item.mediaUris?.length ?? 0) > 0 && (
        <>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} />
          <AnimatedPressable onPress={handleSavePhotos} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }} scaleValue={0.97} haptic="light">
            <DownloadSimple color={colors.accent} size={16} />
            <Text style={{ color: colors.text, fontSize: fontSizes.small }}>Save Photo{(item.mediaUris?.length ?? 0) > 1 ? 's' : ''}</Text>
          </AnimatedPressable>
        </>
      )}
    </Animated.View>
  ) : null;

  const ActionsRow = (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AnimatedPressable
          onPress={(e) => { e.stopPropagation?.(); router.push(`/comments/${item.id}`); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          scaleValue={reduceAnimations ? 1 : 0.85}
          haptic="light"
          accessibilityLabel="Comment"
          accessibilityRole="button"
        >
          <ChatCircle color={colors.textMuted} size={19} />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.commentCount || 0}</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={(e) => { e.stopPropagation?.(); handleRepost(); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          scaleValue={reduceAnimations ? 1 : 0.85}
          haptic="medium"
          accessibilityLabel={reposted ? 'Undo repost' : 'Repost'}
          accessibilityRole="button"
        >
          <Animated.View style={repostAnim}>
            <ArrowsClockwise color={reposted ? colors.success : colors.textMuted} size={19} weight={reposted ? 'bold' : 'regular'} />
          </Animated.View>
          <Text style={{ color: reposted ? colors.success : colors.textMuted, fontSize: fontSizes.caption }}>
            {(item.repostCount || 0) + (reposted ? 1 : 0)}
          </Text>
        </AnimatedPressable>

        <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); toggleBookmarkPress(); }} scaleValue={reduceAnimations ? 1 : 0.85} haptic="medium" accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'} accessibilityRole="button">
          <Animated.View style={bookmarkAnim}>
            <BookmarkSimple color={bookmarked ? colors.accent : colors.textMuted} size={19} weight={bookmarked ? 'fill' : 'regular'} />
          </Animated.View>
        </AnimatedPressable>

        <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); handleNativeShare(); }} scaleValue={reduceAnimations ? 1 : 0.85} haptic="light" accessibilityLabel="Share" accessibilityRole="button">
          <Animated.View style={shareAnim}>
            <ShareNetwork color={colors.textMuted} size={19} />
          </Animated.View>
        </AnimatedPressable>
      </View>
    </View>
  );

  // ── Hero layout (photo / video with media) ──
  if (isHero && !compactFeed) {
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
            borderRadius: heroRadius,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Repost badge */}
          {item.repostedByUsername && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginHorizontal: cardPadding, marginBottom: 0, gap: 6 }}>
              <ArrowsClockwise color={colors.textMuted} size={14} />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.repostedByUsername} re-echoed</Text>
            </View>
          )}

          {/* Hero media block — full bleed */}
          <View style={{ minHeight: 240, position: 'relative' }}>
            {item.postType === 'photo' && (
              <MediaGrid uris={item.mediaUris!} />
            )}
            {item.postType === 'video' && item.videoUri && (
              <InlineVideo uri={item.videoUri} caption={undefined} qualities={item.videoQualities} />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 72 }}
              pointerEvents="none"
            />
          </View>

          {/* Author + content + actions */}
          <View style={{ padding: cardPadding }}>
            {/* Author row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              {showAvatars && (
                <AnimatedPressable
                  onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
                  scaleValue={reduceAnimations ? 1 : 0.9}
                  haptic="light"
                >
                  <View
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                      {(item.displayName || item.username).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </AnimatedPressable>
              )}
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
                style={{ flex: 1 }}
                scaleValue={reduceAnimations ? 1 : 0.98}
                haptic="none"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: textSize, color: colors.text, fontWeight: '600' }}>{item.displayName || item.username}</Text>
                  {item.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>
              </AnimatedPressable>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); setShowMenu(!showMenu); }}
                scaleValue={reduceAnimations ? 1 : 0.85}
                haptic="light"
              >
                <DotsThreeOutline color={colors.textMuted} size={20} />
              </AnimatedPressable>
            </View>

            {MenuOverlay}

            {/* Caption / prompt text */}
            {!!item.prompt && (
              <Text style={{ fontSize: fontSizes.small, color: colors.textSecondary, marginBottom: 10 }} numberOfLines={2}>
                {item.prompt}
              </Text>
            )}

            {/* Hashtags */}
            {item.hashtags && item.hashtags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {item.hashtags.slice(0, 3).map(tag => (
                  <Text key={tag} style={{ color: colors.accent, fontSize: fontSizes.caption }}>#{tag}</Text>
                ))}
              </View>
            )}

            {ActionsRow}
          </View>
        </AnimatedPressable>
      </Animated.View>
    );
  }

  // ── Standard layout (text / poll / compact) ──
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
            <ArrowsClockwise color={colors.textMuted} size={14} />
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
              {item.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            </View>
            {!compactFeed && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>}
          </AnimatedPressable>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); setShowMenu(!showMenu); }}
            scaleValue={reduceAnimations ? 1 : 0.85}
            haptic="light"
          >
            <DotsThreeOutline color={colors.textMuted} size={20} />
          </AnimatedPressable>
        </View>

        {MenuOverlay}

        {/* ── TEXT post ── */}
        {(!item.postType || item.postType === 'text') && (
          <>
            <View style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.md, padding: compactFeed ? 8 : 12, marginBottom: compactFeed ? 8 : 12 }}>
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

        {/* ── PHOTO post (compact or no media) ── */}
        {item.postType === 'photo' && (
          <View style={{ marginBottom: 12 }}>
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, marginBottom: 10 }} numberOfLines={compactFeed ? 1 : 3}>{item.prompt}</Text>
            )}
            {item.mediaUris && item.mediaUris.length > 0 && (
              <MediaGrid uris={item.mediaUris} />
            )}
          </View>
        )}

        {/* ── VIDEO post (compact) ── */}
        {item.postType === 'video' && item.videoUri && (
          <InlineVideo uri={item.videoUri} caption={item.prompt || undefined} qualities={item.videoQualities} />
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

        {ActionsRow}
      </AnimatedPressable>
    </Animated.View>
  );
}

export const FeedCard = React.memo(FeedCardInner, (prev, next) =>
  prev.item.id            === next.item.id &&
  prev.item.isLiked       === next.item.isLiked &&
  prev.item.isBookmarked  === next.item.isBookmarked &&
  prev.item.likes         === next.item.likes &&
  prev.item.commentCount  === next.item.commentCount &&
  prev.index              === next.index,
);
