import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ShareSheet } from '../common/ShareSheet';
import { ActionSheet, ActionItem } from '../common/ActionSheet';
import { RepostChoiceSheet } from './RepostChoiceSheet';
import { QuotedEchoCard } from './QuotedEchoCard';
import { tap } from '../../lib/haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MediaGrid } from './MediaGrid';
import { VideoPreview } from './VideoPreview';
import { useQueryClient } from '@tanstack/react-query';
import { LinkifiedText } from './LinkifiedText';
import { ReactionBar } from './ReactionBar';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import { ZoomableImageViewer } from '../ui/ZoomableImageViewer';
import { showToast } from '../ui/Toast';
import { warmAvatarColor } from '../../lib/avatarPalette';
import { ChatCircle, BookmarkSimple, ArrowsClockwise, ShareNetwork, SealCheck, DotsThree, Flag, UserCircle, UserMinus, ChartBar, Question, PushPin, HeartStraight, GitBranch } from 'phosphor-react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FeedItem, PerspectiveType, Poll } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../lib/theme';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { recordRemoteEchoView } from '../../lib/supabaseEchoApi';
import { useToggleRemoteBookmark, useToggleRemoteLike, useToggleRemoteRepost } from '../../hooks/queries/useSupabaseSocial';
import { usePerformanceProfile } from '../../lib/performance';
import { useResponsiveLayout } from '../../lib/responsive';

interface FeedCardProps {
  item: FeedItem;
  index: number;
  onPress?: () => void;
  pinned?: boolean;
}

// Warm editorial palette (lib/avatarPalette.ts) — one hue per perspective.
const PERSPECTIVE_CHIP: Record<PerspectiveType, { verb: string; color: string; dimColor: string }> = {
  agree:     { verb: 'Builds on',  color: '#7A8B4E', dimColor: '#7A8B4E20' },
  challenge: { verb: 'Challenges', color: '#C65F3F', dimColor: '#C65F3F20' },
  reframe:   { verb: 'Reframes',   color: '#8B5E7D', dimColor: '#8B5E7D20' },
  story:     { verb: 'Story',      color: '#B08536', dimColor: '#B0853620' },
  evidence:  { verb: 'Cites',      color: '#4E7A8B', dimColor: '#4E7A8B20' },
  question:  { verb: 'Questions',  color: '#5E748B', dimColor: '#5E748B20' },
};

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

const PollBar = React.memo(function PollBar({ pct }: { pct: number }) {
  const { colors } = useTheme();
  const width = useSharedValue(0);
  React.useEffect(() => {
    width.value = withTiming(pct, { duration: 500 });
  }, [pct, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: colors.accent + '66' }, style]} />;
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

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function FeedCard({ item, index, onPress, pinned }: FeedCardProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const remote = isSupabaseRemote();
  const remoteBm = useToggleRemoteBookmark();
  const remoteLike = useToggleRemoteLike();
  const remoteRp = useToggleRemoteRepost();
  const { colors, radius, fontSizes, font, reduceAnimations, showAvatars } = useTheme();
  const performance = usePerformanceProfile('hot');
  const layout = useResponsiveLayout();
  const { isBookmarked, toggleBookmark, isReposted, toggleRepost, toggleLike,
    compactFeed, showPreviewCards, votePoll,
  } = useAppStore();
  const bookmarked = remote ? item.isBookmarked : isBookmarked(item.id);
  const reposted = remote ? item.isReposted : isReposted(item.id);
  const [liked, setLiked] = useState(item.isLiked);
  const [likeCount, setLikeCount] = useState(item.likes);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [repostSheetOpen, setRepostSheetOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const toggleMute = useAppStore(s => s.toggleMute);
  const isMuted = useAppStore(s => s.isMuted);
  const notInterestedIds = useAppStore(s => s.notInterestedIds);
  const setNotInterestedIds = useAppStore(s => s.setNotInterestedIds);
  const feedFeedback = useAppStore(s => s.feedFeedback);
  const setFeedFeedback = useAppStore(s => s.setFeedFeedback);

  useEffect(() => {
    setLiked(item.isLiked);
    setLikeCount(item.likes);
  }, [item.id, item.isLiked, item.likes]);

  const handleMainPress = useCallback(() => {
    if (remote) void recordRemoteEchoView(item.id);
    onPress?.();
  }, [remote, item.id, onPress]);

  const toggleBookmarkPress = () => {
    if (remote) {
      remoteBm.mutate({ echoId: item.id, bookmark: !bookmarked });
      showToast(!bookmarked ? 'Bookmarked' : 'Removed bookmark', !bookmarked ? 'Bookmarked' : '');
      return;
    }
    toggleBookmark(item.id);
    qc.invalidateQueries({ queryKey: ['feed'] });
    showToast(!bookmarked ? 'Bookmarked' : 'Removed bookmark', !bookmarked ? 'Bookmarked' : '');
  };

  const handleRepost = () => {
    if (remote) {
      remoteRp.mutate({ echoId: item.id, repost: !reposted });
      showToast(!reposted ? 'Re-echoed!' : 'Removed re-echo', !reposted ? 'Re-echoed' : '');
      return;
    }
    toggleRepost(item.id);
    showToast(!reposted ? 'Re-echoed!' : 'Removed re-echo', !reposted ? 'Re-echoed' : '');
  };

  const handleLikePress = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount(c => next ? c + 1 : Math.max(0, c - 1));
    if (remote) {
      remoteLike.mutate(
        { echoId: item.id, like: next },
        {
          onError: () => {
            setLiked(!next);
            setLikeCount(c => next ? Math.max(0, c - 1) : c + 1);
          },
        }
      );
      return;
    }
    toggleLike(item.id);
    qc.invalidateQueries({ queryKey: ['feed'] });
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

  const handleReport = () => {
    router.push({ pathname: '/report', params: { targetType: 'echo', targetId: item.id, targetName: item.username } });
  };

  const entering = reduceAnimations
    ? undefined
    : performance.listAnimations
      ? FadeInUp.delay(Math.min(index, 3) * 24).duration(80)
      : undefined;

  const textSize = fontSizes.body;
  const cardMargin = layout.isDesktop ? 20 : layout.isTablet ? 18 : 16;

  const isHero =
    (item.postType === 'photo' && (item.mediaUris?.length ?? 0) > 0) ||
    (item.postType === 'video' && !!item.videoUri);

  const menuActions: ActionItem[] = [
    {
      key: 'profile',
      label: 'View Profile',
      icon: <UserCircle color={colors.textSecondary} size={20} />,
      onPress: () => router.push(`/user/${item.userId}`),
    },
    {
      key: 'less',
      label: 'Show less like this',
      icon: <Question color={colors.textSecondary} size={20} />,
      onPress: () => {
        setFeedFeedback({ ...feedFeedback, [item.id]: 'less' });
        tap('success');
        showToast('Got it — less like this', 'Updated');
      },
    },
    {
      key: 'notinterested',
      label: 'Not interested',
      icon: <Flag color={colors.textSecondary} size={20} />,
      onPress: () => {
        setNotInterestedIds([...notInterestedIds, item.id]);
        tap('success');
        showToast('Hidden', 'Done');
      },
    },
    {
      key: 'mute',
      label: isMuted(item.userId) ? `Unmute @${item.username}` : `Mute @${item.username}`,
      icon: <UserMinus color={colors.textSecondary} size={20} />,
      onPress: () => {
        const wasMuted = isMuted(item.userId);
        toggleMute(item.userId);
        tap(wasMuted ? 'light' : 'warning');
        showToast(wasMuted ? `Unmuted @${item.username}` : `Muted @${item.username}`, wasMuted ? 'Unmuted' : 'Muted');
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
      <RepostChoiceSheet
        visible={repostSheetOpen}
        onClose={() => setRepostSheetOpen(false)}
        reposted={reposted}
        onRepost={handleRepost}
        onRemix={handleQuoteRepost}
      />
      <ActionSheet visible={menuSheetOpen} onClose={() => setMenuSheetOpen(false)} subtitle={`@${item.username}`} actions={menuActions} />
      {item.avatarUrl && !avatarError ? (
        <ZoomableImageViewer
          visible={avatarViewerOpen}
          uris={[item.avatarUrl]}
          title={item.displayName || item.username}
          onClose={() => setAvatarViewerOpen(false)}
        />
      ) : null}
    </>
  );

  const ActionButton = ({
    label,
    icon,
    count,
    active,
    color = colors.textMuted,
    onPress,
    onLongPress,
    accessibilityLabel,
  }: {
    label: string;
    icon: React.ReactNode;
    count?: number;
    active?: boolean;
    color?: string;
    onPress: (e: any) => void;
    onLongPress?: (e: any) => void;
    accessibilityLabel?: string;
  }) => (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flex: 1,
        minWidth: 0,
        height: 42,
        borderRadius: 14,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: active ? `${color}1F` : colors.surfaceHover,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? `${color}55` : colors.glassBorder,
      }}
      depth="medium"
      fadeOnPress
      haptic={active ? 'medium' : 'light'}
      performanceMode="hot"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
    >
      {icon}
      {count !== undefined && count > 0 ? (
        <Text
          style={{
            color: active ? color : colors.textSecondary,
            fontSize: 12.5,
            fontFamily: 'Inter_600SemiBold',
            fontVariant: ['tabular-nums'],
          }}
          numberOfLines={1}
        >
          {formatCount(count)}
        </Text>
      ) : null}
    </AnimatedPressable>
  );

  // Secondary actions (branch, share) — lighter-weight plain icons so the four
  // primary social actions read as primary. Everything stays reachable.
  const SecondaryAction = ({ icon, onPress, accessibilityLabel }: { icon: React.ReactNode; onPress: (e: any) => void; accessibilityLabel: string }) => (
    <AnimatedPressable
      onPress={onPress}
      style={{ width: 40, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
      fadeOnPress
      haptic="light"
      performanceMode="hot"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {icon}
    </AnimatedPressable>
  );

  const ActionsRow = (
    <View style={{ paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder }}>
      <View style={{ marginBottom: 8 }}>
        <ReactionBar
          target={{ kind: 'echo', echoId: item.id }}
          counts={item.reactionCounts}
          userReactions={item.userReactions}
          compact
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <ActionButton
          label="Like"
          icon={<HeartStraight color={liked ? '#EF4444' : colors.textMuted} size={20} weight={liked ? 'fill' : 'regular'} />}
          count={likeCount}
          active={liked}
          color="#EF4444"
          onPress={(e) => { e.stopPropagation?.(); handleLikePress(); }}
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        />
        <ActionButton
          label="Reply"
          icon={<ChatCircle color={colors.textMuted} size={20} />}
          count={item.commentCount || undefined}
          onPress={(e) => { e.stopPropagation?.(); router.push(`/comments/${item.id}`); }}
          accessibilityLabel={`Comment. ${item.commentCount || 0} comments`}
        />
        <ActionButton
          label="Repost"
          icon={<ArrowsClockwise color={reposted ? colors.success : colors.textMuted} size={20} weight={reposted ? 'bold' : 'regular'} />}
          count={displayRepostCount || undefined}
          active={reposted}
          color={colors.success}
          onPress={(e) => { e.stopPropagation?.(); handleRepost(); }}
          onLongPress={(e) => { e.stopPropagation?.(); setRepostSheetOpen(true); }}
          accessibilityLabel={reposted ? 'Undo re-echo' : 'Re-echo'}
        />
        <ActionButton
          label="Save"
          icon={<BookmarkSimple color={bookmarked ? colors.accent : colors.textMuted} size={20} weight={bookmarked ? 'fill' : 'regular'} />}
          active={bookmarked}
          color={colors.accent}
          onPress={(e) => { e.stopPropagation?.(); toggleBookmarkPress(); }}
          accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'}
        />
        <SecondaryAction
          icon={<GitBranch color={colors.textMuted} size={18} weight="bold" />}
          onPress={(e) => {
            e.stopPropagation?.();
            router.push({
              pathname: '/remix/[id]',
              params: {
                id: item.id,
                author: item.username,
                ...(item.editorialTitle ? { parentTitle: item.editorialTitle } : {}),
              },
            });
          }}
          accessibilityLabel="Add perspective"
        />
        <SecondaryAction
          icon={<ShareNetwork color={colors.textMuted} size={18} />}
          onPress={(e) => { e.stopPropagation?.(); handleNativeShare(); }}
          accessibilityLabel="Share"
        />
      </View>
    </View>
  );

  if (isHero && !compactFeed) {
    return (
      <Animated.View entering={entering} layout={undefined} style={{ marginHorizontal: layout.isPhone ? 10 : 12, marginVertical: 8 }}>
        <AnimatedPressable
          onPress={handleMainPress}
          depth="soft"
          fadeOnPress
          haptic="light"
          performanceMode="hot"
          style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}
        >
          <View style={{ height: 430 }}>
            {item.postType === 'photo' && (
              <MediaGrid uris={item.mediaUris!} height={430} />
            )}
            {item.postType === 'video' && item.videoUri && (
              <VideoPreview uri={item.videoUri} height={430} borderRadius={0} />
            )}

            {/* Scrims for overlay legibility */}
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100 }}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.86)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 190 }}
              pointerEvents="none"
            />

            {/* Identity overlay */}
            <View style={{ position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); router.push(`/user/${item.userId}`); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}
                depth="soft"
                haptic="none"
                performanceMode="hot"
              >
                {item.avatarUrl && !avatarError ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation?.();
                      setAvatarViewerOpen(true);
                    }}
                    style={{ width: 34, height: 34, borderRadius: 17 }}
                  >
                    <Image
                      source={{ uri: item.avatarUrl }}
                      style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      onError={() => setAvatarError(true)}
                    />
                  </Pressable>
                ) : (
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: warmAvatarColor(item.avatarColor, item.username), alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      {(item.displayName || item.username).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[font.bodySemibold, { fontSize: 14, color: '#fff' }]} numberOfLines={1}>{item.displayName || item.username}</Text>
                    {item.isVerified && <SealCheck color="#fff" size={13} weight="fill" />}
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>{getTimeAgo(item.createdAt)}</Text>
                </View>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={(e) => { e.stopPropagation?.(); setMenuSheetOpen(true); }}
                depth="medium" fadeOnPress haptic="light" performanceMode="hot"
                accessibilityLabel="More options" accessibilityRole="button"
              >
                <DotsThree color="#fff" size={22} weight="bold" />
              </AnimatedPressable>
            </View>

            {/* Title overlay — just the hook, so the image stays clean. The
                author note + hashtags moved below the media (see strip). */}
            {!!(item.editorialTitle ?? item.prompt) && (
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 }}>
                <Text style={[font.display, { fontSize: 22, color: '#fff', lineHeight: 29 }]} numberOfLines={2}>
                  {item.editorialTitle ?? item.prompt}
                </Text>
              </View>
            )}
          </View>
        </AnimatedPressable>
        {(!!item.authorNote || (item.hashtags && item.hashtags.length > 0)) && (
          <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 6 }}>
            {!!item.authorNote && (
              <Text style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 }} numberOfLines={2}>
                {item.authorNote}
              </Text>
            )}
            {item.hashtags && item.hashtags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {item.hashtags.slice(0, 3).map(tag => (
                  <Pressable key={tag} onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/(tabs)/explore', params: { q: `#${tag}` } }); }}>
                    <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '600' }}>#{tag}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
        <View style={{ paddingHorizontal: 4, paddingTop: 9 }}>
          {ActionsRow}
        </View>
        {AllModals}
      </Animated.View>
    );
  }

  const canvasTint = item.avatarColor || colors.accent;
  return (
    <Animated.View
      entering={entering}
      layout={undefined}
      style={compactFeed ? undefined : { marginHorizontal: layout.isPhone ? 10 : 12, marginVertical: 8 }}
    >
      <View style={compactFeed ? {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      } : {
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        shadowColor: '#000',
        shadowOpacity: colors.isDark ? 0.22 : 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      }}>
      {!compactFeed && (
        <LinearGradient
          colors={[`${canvasTint}3D`, `${canvasTint}12`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <AnimatedPressable
        onPress={handleMainPress}
        depth="soft"
        fadeOnPress
        haptic="light"
        performanceMode="hot"
        style={{
          paddingHorizontal: compactFeed ? cardMargin : 18,
          paddingVertical: compactFeed ? 14 : 17,
        }}
      >
        {item.repostedByUsername && (
          <View className="flex-row items-center mb-2 ml-1 gap-1.5">
            <ArrowsClockwise color={colors.textMuted} size={14} />
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>{item.repostedByUsername} re-echoed</Text>
          </View>
        )}
        {item.parentEchoId && (() => {
          const chip = item.perspectiveType ? PERSPECTIVE_CHIP[item.perspectiveType] : null;
          const chipColor = chip?.color ?? colors.textMuted;
          const verb = chip?.verb ?? 'Perspective';
          return (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/thread/[id]', params: { id: String(item.parentEchoId) } }); }}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}
            >
              <View style={{ width: 2.5, height: 14, borderRadius: 2, backgroundColor: chipColor }} />
              <Text style={{ color: chipColor, fontSize: fontSizes.caption, fontFamily: 'Inter_500Medium' }}>
                {verb}{item.parentAuthorUsername ? ` @${item.parentAuthorUsername}` : ''}
              </Text>
            </Pressable>
          );
        })()}
        {!item.parentEchoId && (item.remixCount ?? 0) >= 3 && (
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/evolution/[rootId]', params: { rootId: item.remixRootId ?? item.id } }); }}
            style={{ marginBottom: 10 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular' }}>
              {item.remixCount} perspectives →
            </Text>
          </Pressable>
        )}

        <View className={`flex-row items-center ${compactFeed ? 'mb-2' : 'mb-3'}`} style={{ gap: 0 }}>
          {showAvatars && (
            <AnimatedPressable
              onPress={(e) => {
                e.stopPropagation?.();
                if (item.avatarUrl && !avatarError) {
                  setAvatarViewerOpen(true);
                  return;
                }
                router.push(`/user/${item.userId}`);
              }}
              depth="medium"
              fadeOnPress
              haptic="light"
              performanceMode="hot"
            >
              {item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={{ width: compactFeed ? 30 : 40, height: compactFeed ? 30 : 40, borderRadius: compactFeed ? 15 : 20, marginRight: 12, borderWidth: 1.5, borderColor: `${canvasTint}66` }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  className={`${compactFeed ? 'w-7 h-7' : 'w-9 h-9'} rounded-full items-center justify-center mr-3`}
                  style={{ backgroundColor: warmAvatarColor(item.avatarColor, item.username), borderWidth: 1.5, borderColor: `${canvasTint}66` }}
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
            style={{ minWidth: 0 }}
          >
            <View className="flex-row items-center gap-1" style={{ minWidth: 0 }}>
              <Text style={[font.bodySemibold, { fontSize: textSize, color: colors.text, letterSpacing: 0, flexShrink: 1 }]} numberOfLines={1}>{item.displayName || item.username}</Text>
              {item.isVerified && <SealCheck color={colors.accent} size={14} weight="fill" />}
            </View>
            {!compactFeed && <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{item.username}</Text>}
          </AnimatedPressable>
          {/* Time is lightweight metadata, not a chip — keeps the header calm. */}
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginLeft: 8, marginRight: 8 }}>{getTimeAgo(item.createdAt)}</Text>
          {pinned && <PushPin color={colors.textMuted} size={13} weight="fill" style={{ marginRight: 6 }} />}
          <AnimatedPressable
            onPress={(e) => { e.stopPropagation?.(); setMenuSheetOpen(true); }}
            depth="medium"
            fadeOnPress
            haptic="light"
            performanceMode="hot"
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}
          >
            <DotsThree color={colors.textMuted} size={22} weight="bold" />
          </AnimatedPressable>
        </View>

        {item.postType === 'musing' && !!item.prompt && (
          <Text
            style={[
              font.quote,
              { color: colors.text, fontSize: compactFeed ? 16 : 19, lineHeight: compactFeed ? 24 : 28, marginBottom: compactFeed ? 8 : 12 },
            ]}
            numberOfLines={compactFeed ? 4 : 10}
          >
            {item.prompt}
          </Text>
        )}

        {(!item.postType || item.postType === 'text') && (
          <>
            {!!item.prompt && !item.coAuthor && (
              <Text
                style={[
                  font.display,
                  { color: colors.text, fontSize: compactFeed ? 17 : 23, lineHeight: compactFeed ? 23 : 30, marginBottom: compactFeed ? 6 : 10 },
                ]}
                numberOfLines={compactFeed ? 2 : 4}
              >
                {item.editorialTitle ?? item.prompt}
              </Text>
            )}
            {!!(item.authorNote ?? (showPreviewCards ? item.response : null)) && !item.coAuthor && (
              <LinkifiedText
                text={item.authorNote ?? item.response}
                style={[
                  font.body,
                  { fontSize: textSize, color: colors.textSecondary, lineHeight: Math.round(textSize * 1.55), marginBottom: compactFeed ? 8 : 12, letterSpacing: 0 },
                ]}
                numberOfLines={compactFeed ? 3 : 4}
              />
            )}
            {item.coAuthor && item.response && item.coAuthorResponse && (
              <View style={{ flexDirection: compactFeed ? 'column' : 'row', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Avatar name={item.displayName} color={item.avatarColor} url={item.avatarUrl} size={18} />
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }} numberOfLines={1}>@{item.username}</Text>
                  </View>
                  <LinkifiedText
                    text={item.response}
                    style={{ fontSize: textSize - 1, color: colors.textSecondary, lineHeight: Math.round((textSize - 1) * 1.5) }}
                    numberOfLines={compactFeed ? 3 : 5}
                  />
                </View>
                <View style={{ flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Avatar name={item.coAuthor.displayName} color={item.coAuthor.avatarColor} url={item.coAuthor.avatarUrl} size={18} />
                    <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '600' }} numberOfLines={1}>@{item.coAuthor.username}</Text>
                  </View>
                  <LinkifiedText
                    text={item.coAuthorResponse}
                    style={{ fontSize: textSize - 1, color: colors.textSecondary, lineHeight: Math.round((textSize - 1) * 1.5) }}
                    numberOfLines={compactFeed ? 3 : 5}
                  />
                </View>
              </View>
            )}
            {item.quotedEcho && (() => { try { return <QuotedEchoCard echo={item.quotedEcho!} compact={compactFeed} />; } catch { return null; } })()}
          </>
        )}

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

        {item.postType === 'video' && item.videoUri && (
          <View style={{ marginBottom: 12 }}>
            {!!item.prompt && (
              <Text style={{ fontSize: textSize, color: colors.text, marginBottom: 10 }} numberOfLines={compactFeed ? 1 : 3}>{item.prompt}</Text>
            )}
            <VideoPreview uri={item.videoUri} height={compactFeed ? 180 : 260} borderRadius={radius.md} />
          </View>
        )}

        {item.postType === 'poll' && item.poll && (
          <View style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <ChartBar color={colors.textMuted} size={12} weight="bold" />
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontWeight: '500' }}>
                Poll
              </Text>
            </View>
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

        {!compactFeed && item.hashtags && item.hashtags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-3">
            {item.hashtags.slice(0, 3).map(tag => (
              <Pressable
                key={tag}
                onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/(tabs)/explore', params: { q: `#${tag}` } }); }}
                style={{ borderRadius: 999, backgroundColor: `${colors.accent}16`, paddingHorizontal: 9, paddingVertical: 5 }}
              >
                <Text style={{ color: colors.accent, fontSize: fontSizes.caption, fontFamily: 'Inter_600SemiBold' }}>#{tag}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!compactFeed && (item.viewCount ?? 0) > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginBottom: 8, fontFamily: 'Inter_500Medium' }}>{item.viewCount?.toLocaleString()} views</Text>
        )}

        {ActionsRow}
      </AnimatedPressable>
      </View>
      {AllModals}
    </Animated.View>
  );
}
