import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ShareSheet } from '../common/ShareSheet';
import { ActionSheet, ActionItem } from '../common/ActionSheet';
import { QuotedEchoCard } from './QuotedEchoCard';
import { tap } from '../../lib/haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaGrid } from './MediaGrid';
import { VideoPreview } from './VideoPreview';
import { useQueryClient } from '@tanstack/react-query';
import { LikeButton } from './LikeButton';
import { LinkifiedText } from './LinkifiedText';
import { ReactionBar } from './ReactionBar';
import { RemixButton } from './RemixButton';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { GlassPanel } from '../ui/GlassPanel';
import { SpringCounter } from '../ui/SpringCounter';
import { showToast } from '../ui/Toast';
import { ChatCircle, BookmarkSimple, ArrowsClockwise, ShareNetwork, SealCheck, DotsThreeOutline, Flag, UserMinus, ChartBar, Question, GitBranch, GitFork } from 'phosphor-react-native';
import { NEON } from '../../lib/neonDesign';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withSequence, withTiming } from 'react-native-reanimated';
import { FeedItem, Poll } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { recordRemoteEchoView } from '../../lib/supabaseEchoApi';
import { useToggleRemoteBookmark, useToggleRemoteRepost } from '../../hooks/queries/useSupabaseSocial';
import { MOTION } from '../../lib/motion';
import { usePerformanceProfile } from '../../lib/performance';

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

// PERF: re-animates on every parent render — wrap in React.memo
const PollBar = React.memo(function PollBar({ pct }: { pct: number }) {
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withTiming(pct, { duration: 500 });
  }, [pct, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: 'rgba(99,102,241,0.4)' }, style]} />;
});

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
        const maxVotes = Math.max(...poll.options.map(o => o.votes));
        const isWinner = hasVoted && opt.votes === maxVotes && opt.votes > 0
          && poll.options.findIndex(o => o.votes === maxVotes) === poll.options.indexOf(opt);
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

export function FeedCard({ item, index, onPress }: FeedCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const remoteBm = useToggleRemoteBookmark();
  const remoteRp = useToggleRemoteRepost();
  const { colors, radius, fontSizes, font, reduceAnimations, showAvatars } = useTheme();
  const performance = usePerformanceProfile('hot');
  const { isBookmarked, toggleBookmark, isReposted, toggleRepost,
    compactFeed, showPreviewCards, votePoll,
  } = useAppStore();
  const bookmarked = remote ? item.isBookmarked : isBookmarked(item.id);
  const reposted = remote ? item.isReposted : isReposted(item.id);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [repostSheetOpen, setRepostSheetOpen] = useState(false);
  const [feedFeedbackOpen, setFeedFeedbackOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const toggleMute = useAppStore(s => s.toggleMute);
  const isMuted = useAppStore(s => s.isMuted);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const setNotInterestedIds = useAppStore(s => s.setNotInterestedIds);
  const feedFeedback = useAppStore(s => s.feedFeedback);
  const setFeedFeedback = useAppStore(s => s.setFeedFeedback);

  // Press feedback comes from the AnimatedPressable wrapper that hosts each
  // icon — we used to add per-icon bounce shared values (one each for
  // bookmark/repost/share) but that costs three worklets and three
  // useAnimatedStyle hooks per card. Across a feed of 20 cards that's 60 dead
  // worklets just to redo a feedback the parent already provides.
  const handleMainPress = useCallback(() => {
    if (remote) void recordRemoteEchoView(item.id);
    onPress?.();
  }, [remote, item.id, onPress]);

  const toggleBookmarkPress = () => {
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
    if (remote) {
      remoteRp.mutate({ echoId: item.id, repost: !reposted });
      showToast(!reposted ? 'Re-echoed!' : 'Removed re-echo', !reposted ? '\u{1F501}' : '');
      return;
    }
    toggleRepost(item.id);
    showToast(!reposted ? 'Re-echoed!' : 'Removed re-echo', !reposted ? '\u{1F501}' : '');
  };

  const displayRepostCount = remote
    ? (item.repostCount || 0)
    : (item.repostCount || 0) + (reposted ? 1 : 0);

  const handleNativeShare = async () => {
    setShareOpen(true);
  };

  const handleQuoteRepost = useCallback(() => {
    setRepostSheetOpen(false);
    router.push({ pathname: '/create-post', params: { quoted: item.id } });
  }, [router, item.id]);

  const handleLongPressCard = () => {
    tap('medium');
    setFeedFeedbackOpen(true);
  };

  const repostActions: ActionItem[] = [
    {
      key: 'repost',
      label: reposted ? 'Undo re-echo' : 'Re-echo',
      icon: <ArrowsClockwise color={colors.text} size={20} />,
      onPress: () => handleRepost(),
    },
    {
      key: 'quote',
      label: 'Remix',
      icon: <GitFork color={colors.text} size={20} />,
      onPress: handleQuoteRepost,
    },
  ];

  const feedFeedbackActions: ActionItem[] = [
    {
      key: 'less',
      label: 'Show less like this',
      onPress: () => { setFeedFeedback({ ...feedFeedback, [item.id]: 'less' }); tap('success'); showToast('Got it — less like this', '👍'); },
    },
    {
      key: 'mute',
      label: isMuted(item.userId) ? `Unmute @${item.username}` : `Mute @${item.username}`,
      onPress: () => {
        const wasMuted = isMuted(item.userId);
        toggleMute(item.userId);
        tap(wasMuted ? 'light' : 'warning');
        showToast(wasMuted ? `Unmuted @${item.username}` : `Muted @${item.username}`, wasMuted ? '🔔' : '🔕');
      },
    },
    {
      key: 'notinterested',
      label: 'Not interested',
      onPress: () => { setNotInterestedIds([...notInterestedIds, item.id]); tap('success'); showToast('Hidden', '✓'); },
    },
  ];

  const handleReport = () => {
    router.push({ pathname: '/report', params: { targetType: 'echo', targetId: item.id, targetName: item.username } });
  };

  const entering = reduceAnimations
    ? undefined
    : performance.listAnimations
      ? FadeInUp.delay(Math.min(index, 3) * 24).duration(80)
      : undefined;

  const textSize = fontSizes.body;
  const cardPadding = compactFeed ? 12 : 16;

  const isHero =
    (item.postType === 'photo' && (item.mediaUris?.length ?? 0) > 0) ||
    (item.postType === 'video' && !!item.videoUri);

  const heroRadius = radius.card + 4;

  // ── Shared sub-sections ──

  const menuActions: ActionItem[] = [
    {
      key: 'profile',
      label: 'View Profile',
      icon: <UserMinus color={colors.textSecondary} size={20} />,
      onPress: () => router.push(`/user/${item.userId}`),
    },
    {
      key: 'mute',
      label: isMuted(item.userId) ? `Unmute @${item.username}` : `Mute @${item.username}`,
      icon: <UserMinus color={colors.textSecondary} size={20} />,
      onPress: () => {
        const wasMuted = isMuted(item.userId);
        toggleMute(item.userId);
        tap(wasMuted ? 'light' : 'warning');
        showToast(wasMuted ? `Unmuted @${item.username}` : `Muted @${item.username}`, wasMuted ? '🔔' : '🔕');
      },
    },
    {
      key: 'report',
      label: 'Report',
      icon: <Flag color="#F59E0B" size={20} weight="fill" />,
      destructive: true,
      onPress: handleReport,
    },
  ];

  const AllModals = (
    <>
      <ShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} echo={item} />
      <ActionSheet visible={repostSheetOpen} onClose={() => setRepostSheetOpen(false)} title="Re-echo or quote?" actions={repostActions} />
      <ActionSheet visible={feedFeedbackOpen} onClose={() => setFeedFeedbackOpen(false)} actions={feedFeedbackActions} />
      <ActionSheet visible={menuSheetOpen} onClose={() => setMenuSheetOpen(false)} subtitle={`@${item.username}`} actions={menuActions} />
    </>
  );

  const ActionsRow = (
    <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      {/* Knowledge-reactions pile (rendered above the heart/comment row). */}
      <View style={{ marginBottom: 8 }}>
        <ReactionBar
          target={{ kind: 'echo', echoId: item.id }}
          counts={item.reactionCounts}
          userReactions={item.userReactions}
          compact
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LikeButton echoId={item.id} initialLikes={item.likes} initialLiked={item.isLiked} />
        <RemixButton
          echoId={item.id}
          remixCount={item.remixCount ?? 0}
          authorUsername={item.username}
          authorTitle={item.editorialTitle}
          compact
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AnimatedPressable
          onPress={(e) => { e.stopPropagation?.(); router.push(`/comments/${item.id}`); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          depth="medium"
          fadeOnPress
          haptic="light"
          performanceMode="hot"
          accessibilityLabel={`Comment. ${item.commentCount || 0} comments`}
          accessibilityRole="button"
        >
          <ChatCircle color={colors.textMuted} size={19} />
          <SpringCounter value={item.commentCount || 0} performanceMode="hot" style={{ color: colors.textMuted, fontSize: fontSizes.caption }} />
        </AnimatedPressable>

        <AnimatedPressable
          onPress={(e) => { e.stopPropagation?.(); handleRepost(); }}
          onLongPress={(e) => { e.stopPropagation?.(); setRepostSheetOpen(true); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          depth="medium"
          fadeOnPress
          haptic="medium"
          performanceMode="hot"
          accessibilityLabel={reposted ? 'Undo re-echo' : 'Re-echo'}
          accessibilityRole="button"
        >
          <ArrowsClockwise color={reposted ? colors.success : colors.textMuted} size={19} weight={reposted ? 'bold' : 'regular'} />
          <SpringCounter value={displayRepostCount} performanceMode="hot" style={{ color: reposted ? colors.success : colors.textMuted, fontSize: fontSizes.caption }} />
        </AnimatedPressable>

        <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); toggleBookmarkPress(); }} depth="medium" fadeOnPress haptic="medium" performanceMode="hot" accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'} accessibilityRole="button">
          <BookmarkSimple color={bookmarked ? colors.accent : colors.textMuted} size={19} weight={bookmarked ? 'fill' : 'regular'} />
        </AnimatedPressable>

        <AnimatedPressable onPress={(e) => { e.stopPropagation?.(); handleNativeShare(); }} depth="medium" fadeOnPress haptic="light" performanceMode="hot" accessibilityLabel="Share" accessibilityRole="button">
          <ShareNetwork color={colors.textMuted} size={19} />
        </AnimatedPressable>
      </View>
      </View>
      {/* ⚡ Echo identity chip */}
      {(!item.postType || item.postType === 'text') && !compactFeed && (
        <View style={{ alignItems: 'flex-end', marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: colors.accent + '18' }}>
            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>⚡ Echo</Text>
          </View>
        </View>
      )}
    </View>
  );

  // ── Hero layout (photo / video with media) ──
  if (isHero && !compactFeed) {
    return (
      <Animated.View entering={entering} layout={undefined}>
        <AnimatedPressable
          onPress={handleMainPress}
          depth="soft"
          fadeOnPress
          haptic="light"
          performanceMode="hot"
          style={{
            marginHorizontal: 16,
            marginVertical: 6,
            borderRadius: heroRadius,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            backgroundColor: colors.surface,
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
              <VideoPreview uri={item.videoUri} height={300} borderRadius={0} />
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
                  depth="medium"
                  fadeOnPress
                  haptic="light"
                  performanceMode="hot"
                >
                  {item.avatarUrl && !avatarError ? (
                    <Image
                      source={{ uri: item.avatarUrl }}
                      style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <View
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.avatarColor || colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                        {(item.displayName || item.username).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </AnimatedPressable>
              )}
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
                style={{ flex: 1 }}
                depth="soft"
                haptic="none"
                performanceMode="hot"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[font.bodySemibold, { fontSize: textSize, color: colors.text, letterSpacing: -0.1 }]}>{item.displayName || item.username}</Text>
                  {item.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
                </View>
                {/* Mood chip — only renders when the author has an active mood. */}
                {item.authorMood ? (
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.accent, fontSize: fontSizes.caption, fontStyle: 'italic', marginTop: 1 }}
                  >
                    · {item.authorMood}
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>
                )}
              </AnimatedPressable>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); setMenuSheetOpen(true); }}
                depth="medium"
                fadeOnPress
                haptic="light"
                performanceMode="hot"
                accessibilityLabel="More options"
                accessibilityRole="button"
              >
                <DotsThreeOutline color={colors.textMuted} size={20} />
              </AnimatedPressable>
            </View>

            {/* Title + caption */}
            {!!(item.editorialTitle ?? item.prompt) && (
              <Text style={{ fontSize: textSize, color: colors.text, fontWeight: '700', marginBottom: item.authorNote ? 4 : 10, lineHeight: textSize * 1.3 }} numberOfLines={2}>
                {item.editorialTitle ?? item.prompt}
              </Text>
            )}
            {!!item.authorNote && (
              <Text style={{ fontSize: fontSizes.small, color: colors.textSecondary, marginBottom: 10 }} numberOfLines={2}>
                {item.authorNote}
              </Text>
            )}

            {/* Hashtags */}
            {item.hashtags && item.hashtags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {item.hashtags.slice(0, 3).map(tag => (
                  <Pressable key={tag} onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/(tabs)/search', params: { q: `#${tag}` } as any }); }}>
                    <Text style={{ color: colors.accent, fontSize: fontSizes.caption }}>#{tag}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {ActionsRow}
          </View>
        </AnimatedPressable>
        {AllModals}
      </Animated.View>
    );
  }

  // ── Standard layout (text / poll / compact) ──
  return (
    <Animated.View entering={entering} layout={undefined} style={{ marginHorizontal: 16, marginVertical: 6 }}>
      <GlassPanel variant="light" borderRadius={radius.card} elevated performanceMode="hot">
        {/* Left accent rail — the Echo identity stripe */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: colors.accent + '55',
            borderTopLeftRadius: radius.card,
            borderBottomLeftRadius: radius.card,
            zIndex: 1,
          }}
        />
      <AnimatedPressable
        onPress={handleMainPress}
        onLongPress={handleLongPressCard}
        depth="soft"
        fadeOnPress
        haptic="light"
        performanceMode="hot"
        style={{
          padding: cardPadding,
        }}
      >
        {/* Repost badge */}
        {item.repostedByUsername && (
          <View className="flex-row items-center mb-2 ml-1 gap-1.5">
            <ArrowsClockwise color={colors.textMuted} size={14} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.repostedByUsername} re-echoed</Text>
          </View>
        )}
        {/* Remix lineage chip — shows when this echo is a remix of another */}
        {item.parentEchoId && (
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/thread/[id]', params: { id: String(item.parentEchoId) } }); }}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 2, gap: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(34,245,255,0.08)', borderWidth: 1, borderColor: 'rgba(34,245,255,0.28)' }}
          >
            <GitBranch color={NEON.cyan} size={12} weight="fill" />
            <Text style={{ color: NEON.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>
              REMIX{item.parentAuthorUsername ? ` · @${item.parentAuthorUsername}` : ''}
            </Text>
          </Pressable>
        )}

        {/* Author row */}
        <View className={`flex-row items-center ${compactFeed ? 'mb-2' : 'mb-3'}`}>
          {showAvatars && (
            <AnimatedPressable
              onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
              depth="medium"
              fadeOnPress
              haptic="light"
              performanceMode="hot"
            >
              {item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={{ width: compactFeed ? 28 : 36, height: compactFeed ? 28 : 36, borderRadius: compactFeed ? 14 : 18, marginRight: 12 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  className={`${compactFeed ? 'w-7 h-7' : 'w-9 h-9'} rounded-full items-center justify-center mr-3`}
                  style={{ backgroundColor: item.avatarColor || colors.accent }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                    {(item.displayName || item.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
            className="flex-1"
            depth="soft"
            haptic="none"
            performanceMode="hot"
          >
            <View className="flex-row items-center gap-1">
              <Text style={[font.bodySemibold, { fontSize: textSize, color: colors.text, letterSpacing: -0.1 }]}>{item.displayName || item.username}</Text>
              {item.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            </View>
            {!compactFeed && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>}
          </AnimatedPressable>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); setMenuSheetOpen(true); }}
            depth="medium"
            fadeOnPress
            haptic="light"
            performanceMode="hot"
          >
            <DotsThreeOutline color={colors.textMuted} size={20} />
          </AnimatedPressable>
        </View>

        {/* ── TEXT post ──
            Signature treatment: the prompt is rendered as a small italic
            pull-quote indented behind a 2px accent rule, with the response
            as the larger body weight below it. This is the visual
            differentiator that makes Echo not-Twitter — the two-part
            framing reads as "question then take" at a glance. */}
        {(!item.postType || item.postType === 'text') && (
          <>
            {!!item.prompt && !item.coAuthor && (
              <View style={{ flexDirection: 'row', marginBottom: compactFeed ? 8 : 10 }}>
                <View style={{ width: 2, backgroundColor: colors.accent, borderRadius: 1, marginRight: 10, opacity: 0.8 }} />
                <Text
                  style={[
                    font.quote,
                    { color: colors.textSecondary, fontSize: textSize - 1, lineHeight: (textSize - 1) * 1.55, flex: 1 },
                  ]}
                  numberOfLines={compactFeed ? 2 : 3}
                >
                  {item.editorialTitle ?? item.prompt}
                </Text>
              </View>
            )}
            {!!(item.authorNote ?? (showPreviewCards ? item.response : null)) && !item.coAuthor && (
              <LinkifiedText
                text={item.authorNote ?? item.response}
                style={[
                  font.bodyMedium,
                  { fontSize: textSize + 1, color: colors.text, lineHeight: (textSize + 1) * 1.5, marginBottom: compactFeed ? 8 : 12, letterSpacing: -0.1 },
                ]}
                numberOfLines={compactFeed ? 3 : 5}
              />
            )}
            {/* Co-echo: two takes side by side. Falls back to a stacked layout
                in compact mode so the cards don't get squashed. */}
            {item.coAuthor && item.response && item.coAuthorResponse && (
              <View style={{ flexDirection: compactFeed ? 'column' : 'row', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: item.avatarColor, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 10 }}>{item.displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }} numberOfLines={1}>@{item.username}</Text>
                  </View>
                  <LinkifiedText
                    text={item.response}
                    style={{ fontSize: textSize - 1, color: colors.textSecondary, lineHeight: (textSize - 1) * 1.5 }}
                    numberOfLines={compactFeed ? 3 : 5}
                  />
                </View>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: item.coAuthor.avatarColor, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 10 }}>{item.coAuthor.displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }} numberOfLines={1}>@{item.coAuthor.username}</Text>
                  </View>
                  <LinkifiedText
                    text={item.coAuthorResponse}
                    style={{ fontSize: textSize - 1, color: colors.textSecondary, lineHeight: (textSize - 1) * 1.5 }}
                    numberOfLines={compactFeed ? 3 : 5}
                  />
                </View>
              </View>
            )}
            {item.quotedEcho && (() => { try { return <QuotedEchoCard echo={item.quotedEcho!} compact={compactFeed} />; } catch { return null; } })()}
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
          <View style={{ marginBottom: 12 }}>
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, marginBottom: 10 }} numberOfLines={compactFeed ? 1 : 3}>{item.prompt}</Text>
            )}
            <VideoPreview uri={item.videoUri} height={compactFeed ? 180 : 260} borderRadius={radius.md} />
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

        {ActionsRow}
      </AnimatedPressable>
      </GlassPanel>
      {AllModals}
    </Animated.View>
  );
}
