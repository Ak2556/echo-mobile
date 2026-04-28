import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  HeartStraight, ChatCircle, BookmarkSimple, ShareNetwork,
  SpeakerHigh, SpeakerSlash, SealCheck, Play,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { showToast } from '../ui/Toast';
import { FeedItem } from '../../types';

interface EchoCardProps {
  item: FeedItem;
  index: number;
  activeIdxRef: React.RefObject<number>;
  onCommentPress?: (item: FeedItem) => void;
}

function SidebarButton({
  icon, label, color, onPress, accessibilityLabel,
}: {
  icon: React.ReactNode;
  label?: string | number;
  color?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.8, { damping: 6 }, () => {
      scale.value = withSpring(1, { damping: 10 });
    });
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={accessibilityLabel} accessibilityRole="button">
      <Animated.View style={style}>{icon}</Animated.View>
      {label !== undefined && label !== 0 && (
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
          {typeof label === 'number' && label >= 1000 ? `${(label / 1000).toFixed(1)}k` : label}
        </Text>
      )}
    </Pressable>
  );
}

export function EchoCardInner({ item, index, activeIdxRef, onCommentPress }: EchoCardProps) {
  const { colors } = useTheme();
  const { height: SCREEN_H } = useWindowDimensions();
  const toggleLike     = useAppStore(s => s.toggleLike);
  const toggleBookmark = useAppStore(s => s.toggleBookmark);

  // Derive isActive from ref so renderItem doesn't need activeIdx as a dep
  const isActive = index === activeIdxRef.current;

  const videoRef = useRef<Video>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(item.isLiked);
  const [likeCount, setLikeCount] = useState(item.likes);
  const [isBookmarked, setIsBookmarked] = useState(item.isBookmarked);

  // Sync local state when query cache updates (e.g. after a remote like via Track 1 select)
  useEffect(() => {
    setIsLiked(item.isLiked);
    setLikeCount(item.likes);
    setIsBookmarked(item.isBookmarked);
  }, [item.id, item.isLiked, item.likes, item.isBookmarked]);

  const lastTapRef = useRef(0);

  // Heart burst animation
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  // Safety-net timeout
  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), 12000);
    return () => clearTimeout(t);
  }, [item.videoUri, loadState]);

  // Auto-play / pause based on visibility
  useEffect(() => {
    if (loadState !== 'ready') return;
    if (isActive) {
      videoRef.current?.playAsync().catch(() => {});
    } else {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [isActive, loadState]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setLoadState('ready');
    setPlaying(status.isPlaying);
    if (status.didJustFinish) {
      // Loop
      videoRef.current?.setPositionAsync(0).then(() => videoRef.current?.playAsync()).catch(() => {});
    }
  }, []);

  const burstHeart = () => {
    heartScale.value = 0;
    heartOpacity.value = 1;
    heartScale.value = withSpring(1.4, { damping: 7, stiffness: 200 });
    setTimeout(() => {
      heartOpacity.value = withTiming(0, { duration: 500 });
    }, 700);
  };

  const handleTap = async () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // Double-tap — like
      if (!isLiked) {
        setIsLiked(true);
        setLikeCount(c => c + 1);
        toggleLike(item.id);
        burstHeart();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } else {
      // Single tap — play/pause
      if (loadState !== 'ready') return;
      if (playing) {
        await videoRef.current?.pauseAsync().catch(() => {});
      } else {
        await videoRef.current?.playAsync().catch(() => {});
      }
    }
    lastTapRef.current = now;
  };

  const handleLike = () => {
    const next = !isLiked;
    setIsLiked(next);
    setLikeCount(c => next ? c + 1 : c - 1);
    toggleLike(item.id);
    if (next) {
      burstHeart();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBookmark = () => {
    const next = !isBookmarked;
    setIsBookmarked(next);
    toggleBookmark(item.id);
    showToast(next ? 'Saved to bookmarks' : 'Removed from bookmarks', next ? '🔖' : '✓');
  };

  const handleShare = () => {
    showToast('Link copied!', '🔗');
  };

  const toggleMute = async () => {
    await videoRef.current?.setIsMutedAsync(!muted).catch(() => {});
    setMuted(m => !m);
  };

  const videoUri = item.videoUri ?? '';
  const initials = (item.displayName || item.username || '?').charAt(0).toUpperCase();

  return (
    <View style={{ width: '100%', height: SCREEN_H, backgroundColor: '#000' }}>
      {/* ── Video ────────────────────────────────────── */}
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={{ position: 'absolute', inset: 0 }}
        resizeMode={ResizeMode.COVER}
        isMuted={muted}
        shouldPlay={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />

      {/* ── Loading overlay ───────────────────────── */}
      {loadState === 'loading' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {/* ── Error state ───────────────────────────── */}
      {loadState === 'error' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', gap: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Couldn't load video</Text>
          <Pressable
            onPress={() => setLoadState('loading')}
            style={{ paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: '#6366F1' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* ── Tap layer (play/pause + double-tap like) ─ */}
      <Pressable
        onPress={handleTap}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Paused indicator */}
      {loadState === 'ready' && !playing && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={28} color="#fff" weight="fill" />
          </View>
        </View>
      )}

      {/* ── Heart burst ───────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, heartStyle]}
      >
        <HeartStraight color="#FF4D6D" size={96} weight="fill" />
      </Animated.View>

      {/* ── Bottom gradient (simulated with 5 layers) ── */}
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 340 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0)' }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)' }} />
      </View>

      {/* ── Author + caption (bottom-left) ───────── */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 70, paddingHorizontal: 16, paddingBottom: 100 }}>
        {/* Author row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: item.avatarColor || '#6366F1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{initials}</Text>
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                {item.displayName || item.username}
              </Text>
              {item.isVerified && <SealCheck color="#60A5FA" size={15} weight="fill" />}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>@{item.username}</Text>
          </View>
        </View>

        {/* Caption */}
        {!!item.prompt && (
          <Text
            numberOfLines={2}
            style={{ color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500', marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
          >
            {item.prompt}
          </Text>
        )}

        {/* Hashtags */}
        {item.hashtags?.length > 0 && (
          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
            {item.hashtags.slice(0, 4).map(t => `#${t}`).join(' ')}
          </Text>
        )}
      </View>

      {/* ── Right sidebar ─────────────────────────── */}
      <View style={{ position: 'absolute', right: 12, bottom: 100, alignItems: 'center', gap: 24 }}>
        <SidebarButton
          icon={<HeartStraight color={isLiked ? '#FF4D6D' : '#fff'} size={30} weight={isLiked ? 'fill' : 'regular'} />}
          label={likeCount}
          onPress={handleLike}
          accessibilityLabel="Like"
        />
        <SidebarButton
          icon={<ChatCircle color="#fff" size={30} />}
          label={item.commentCount}
          onPress={() => onCommentPress?.(item)}
          accessibilityLabel="Comment"
        />
        <SidebarButton
          icon={<BookmarkSimple color={isBookmarked ? '#FBBF24' : '#fff'} size={30} weight={isBookmarked ? 'fill' : 'regular'} />}
          onPress={handleBookmark}
          accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
        />
        <SidebarButton
          icon={<ShareNetwork color="#fff" size={28} />}
          onPress={handleShare}
          accessibilityLabel="Share"
        />
        <SidebarButton
          icon={muted
            ? <SpeakerSlash color="#fff" size={26} />
            : <SpeakerHigh color="#fff" size={26} />}
          onPress={toggleMute}
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        />
      </View>
    </View>
  );
}

export const EchoCard = React.memo(EchoCardInner,
  (prev, next) => prev.item.id === next.item.id && prev.index === next.index,
);
