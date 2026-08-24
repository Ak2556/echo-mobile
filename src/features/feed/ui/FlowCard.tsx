import { useSafeAreaInsets } from "react-native-safe-area-context";

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { HeartStraight, ChatCircle, ShareNetwork, BookmarkSimple, SpeakerHigh, SpeakerSlash, MusicNotesPlus, Play, Pause } from 'phosphor-react-native';
import { FeedItem } from '../../../../types/index';
import { VideoPreview } from './VideoPreview';
import { useResponsiveLayout } from '../../../shared/lib/responsive';
import { useTheme } from '../../../shared/lib/theme';
import { warmAvatarColor } from '../../../../lib/avatarPalette';
import { useToggleRemoteLike, useToggleRemoteBookmark } from '../api/useSupabaseSocial';
import { useAppStore } from '../../../../store/useAppStore';
import { useActiveVideoStore } from '../../../../store/useActiveVideoStore';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS, withDelay } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.4)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const ICON_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 5,
};

function formatCount(n: number): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ActionButton({ icon: Icon, color = '#fff', weight = 'regular', label, onPress, size = 36 }: any) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginBottom: 20 }}>
      <View style={ICON_SHADOW}>
        <Icon size={size} color={color} weight={weight} />
      </View>
      {!!label && (
        <Text style={{ 
          color: '#fff', 
          fontSize: 13, 
          marginTop: 6,
          fontWeight: '700',
          ...TEXT_SHADOW
        }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function FlowCard({ item, index }: { item: FeedItem; index: number }) {
  const { colors, font } = useTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const height = layout.height;
  const { mutate: toggleLike } = useToggleRemoteLike();
  const { mutate: toggleBookmark } = useToggleRemoteBookmark();
  
  // Paused is per card and deliberately not global: scrolling to the next
  // video should start it playing, not inherit a pause from the last one.
  const [paused, setPaused] = useState(false);
  const activeEchoId = useActiveVideoStore(s => s.activeEchoId);

  // Clear the pause once this card is no longer the one on screen. Without
  // this, scrolling away from a paused video and back leaves it stuck paused
  // with no indication why.
  useEffect(() => {
    if (activeEchoId !== item.id && paused) setPaused(false);
  }, [activeEchoId, item.id, paused]);
  const soundEnabled = useAppStore(s => s.soundEnabled);
  const setSoundEnabled = useAppStore(s => s.setSoundEnabled);

  const avatarColor = warmAvatarColor(item.displayName || 'E');

  // Double tap heart animation state
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const [heartPos, setHeartPos] = useState({ x: 0, y: 0 });

  // Mute indicator animation state
  const muteScale = useSharedValue(0);
  const muteOpacity = useSharedValue(0);

  const onDoubleTap = useCallback((x: number, y: number) => {
    setHeartPos({ x, y });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    heartScale.value = 0;
    heartOpacity.value = 1;
    heartScale.value = withSequence(
      withSpring(1.2, { damping: 12, stiffness: 200 }),
      withSpring(1.0, { damping: 10, stiffness: 150 }),
      withDelay(400, withTiming(0, { duration: 300 }))
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withDelay(600, withTiming(0, { duration: 300 }))
    );

    if (!item.isLiked) {
      toggleLike({ echoId: item.id, like: true });
    }
  }, [item.isLiked, item.id, toggleLike, heartScale, heartOpacity]);

  // Tap pauses. This used to toggle sound, which is why tapping to pause
  // appeared to do nothing — the video muted and kept playing. Sound moved to
  // its own button so it is still reachable.
  const onSingleTap = useCallback(() => {
    setPaused(p => !p);

    muteScale.value = 0.5;
    muteOpacity.value = 1;
    muteScale.value = withSpring(1, { damping: 15 });
    muteOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(800, withTiming(0, { duration: 300 }))
    );
  }, [muteScale, muteOpacity]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(!soundEnabled);
  }, [soundEnabled, setSoundEnabled]);

  const singleTap = Gesture.Tap().maxDuration(250).onStart(() => { runOnJS(onSingleTap)(); });
  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDelay(250).onStart((e) => { runOnJS(onDoubleTap)(e.x, e.y); });
  const taps = Gesture.Exclusive(doubleTap, singleTap);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -60 },
      { translateY: -60 },
      { scale: heartScale.value },
      { rotate: '-10deg' }
    ],
    opacity: heartOpacity.value,
  }));

  const muteStyle = useAnimatedStyle(() => ({
    transform: [{ scale: muteScale.value }],
    opacity: muteOpacity.value,
  }));
  
  if (item.postType !== 'video' || !item.videoUri) {
    return (
      <View style={{ height, width: '100%', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Unsupported media type</Text>
      </View>
    );
  }

  return (
    <View style={{ height, width: '100%', backgroundColor: '#000' }}>
      <View style={StyleSheet.absoluteFill}>
        <VideoPreview
          uri={item.videoUri}
          height={height}
          borderRadius={0}
          echoId={item.id}
          viewCount={item.viewCount}
          paused={paused}
        />
      </View>

      {/* The tap surface sits ON TOP of the video, not around it.
          expo-video's VideoView is a native surface; when it was a descendant
          of the GestureDetector it consumed the touch itself and neither the
          single nor the double tap ever fired. A transparent sibling above it
          receives the touch instead.
          Controls rendered after this are still tappable — later siblings take
          the touch first. */}
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: heartPos.x, top: heartPos.y, width: 120, height: 120,
        alignItems: 'center', justifyContent: 'center', ...ICON_SHADOW,
      }, heartStyle]}>
        <LinearGradient
          colors={['#FF2A54', '#FF4B72']}
          style={{ width: 100, height: 100, borderRadius: 50, position: 'absolute', opacity: 0.8, filter: 'blur(10px)' }}
        />
        <HeartStraight weight="fill" color="#FF2A54" size={130} />
      </Animated.View>

      {/* Sound has its own control now that tapping the video pauses it.
          Sits above the gesture layer so it is not swallowed by the tap. */}
      <Pressable
        onPress={toggleSound}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={soundEnabled ? 'Mute video' : 'Unmute video'}
        style={{
          position: 'absolute',
          top: (insets?.top || 0) + 12,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        {soundEnabled ? (
          <SpeakerHigh color="#fff" size={20} weight="fill" />
        ) : (
          <SpeakerSlash color="#fff" size={20} weight="fill" />
        )}
      </Pressable>

      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', top: '45%', alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)', padding: 24, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
      }, muteStyle]}>
        {paused ? (
          <Play color="#fff" size={42} weight="fill" />
        ) : (
          <Pause color="#fff" size={42} weight="fill" />
        )}
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.5, 1]}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingTop: 80, paddingBottom: layout.isDesktop ? 32 : (56 + (insets?.bottom || 0) + 16),
          paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end',
          justifyContent: 'space-between', pointerEvents: 'box-none'
        }}
      >
        <View style={{ flex: 1, paddingRight: 30, paddingBottom: 10 }}>
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ 
              width: 40, height: 40, borderRadius: 20, 
              backgroundColor: avatarColor, overflow: 'hidden', 
              marginRight: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
              ...ICON_SHADOW
            }}>
              {item.avatarUrl ? (
                <Image source={item.avatarUrl} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                    {item.displayName?.[0]?.toUpperCase() || 'E'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[font.bodyBold, { color: '#fff', fontSize: 16, letterSpacing: 0.2, ...TEXT_SHADOW }]}>{item.displayName}</Text>
            
            {/* Tiny Follow Pill */}
            {!item.isLiked && ( // Just an aesthetic mockup for the pill
              <View style={{ marginLeft: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Follow</Text>
              </View>
            )}
          </Pressable>
          
          <Text style={[font.bodyMedium, { color: 'rgba(255,255,255,0.95)', fontSize: 15, lineHeight: 22, marginBottom: 12, ...TEXT_SHADOW }]} numberOfLines={3}>
            {item.prompt}
          </Text>

          {/* Fake Music Track */}
          <View style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.9 }}>
            <MusicNotesPlus size={14} color="#fff" weight="fill" style={ICON_SHADOW} />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500', marginLeft: 6, ...TEXT_SHADOW }}>Original Audio - {item.username}</Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingBottom: 10 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ 
              width: 46, height: 46, borderRadius: 23, 
              backgroundColor: avatarColor, overflow: 'hidden', 
              borderWidth: 2, borderColor: '#fff',
              ...ICON_SHADOW
            }}>
              {item.avatarUrl ? (
                <Image source={item.avatarUrl} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                    {item.displayName?.[0]?.toUpperCase() || 'E'}
                  </Text>
                </View>
              )}
            </Pressable>
            <View style={{ position: 'absolute', bottom: -8, backgroundColor: colors.accent, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000' }}>
              <Text style={{ color: '#000', fontSize: 14, fontWeight: '900', lineHeight: 16 }}>+</Text>
            </View>
          </View>

          <ActionButton 
            icon={HeartStraight} 
            color={item.isLiked ? '#FF2A54' : '#fff'} 
            weight={item.isLiked ? 'fill' : 'fill'} 
            label={formatCount(item.likes)}
            onPress={() => toggleLike({ echoId: item.id, like: !item.isLiked })}
          />
          <ActionButton 
            icon={ChatCircle} 
            weight="fill"
            label={formatCount(item.commentCount) || '0'}
            onPress={() => router.push(`/thread/${item.id}`)}
          />
          <ActionButton 
            icon={BookmarkSimple} 
            color={item.isBookmarked ? '#FBBF24' : '#fff'}
            weight="fill"
            label={item.isBookmarked ? 'Saved' : 'Save'}
            onPress={() => toggleBookmark({ echoId: item.id, bookmark: !item.isBookmarked })}
          />
          <ActionButton 
            icon={ShareNetwork} 
            weight="fill"
            label="Share"
            onPress={() => {
              import('react-native').then(({ Share }) => {
                Share.share({ url: `https://echo.app/e/${item.id}`, message: `Check out this echo by @${item.username}: https://echo.app/e/${item.id}` });
              });
            }}
          />
        </View>
      </LinearGradient>
    </View>
  );
}
