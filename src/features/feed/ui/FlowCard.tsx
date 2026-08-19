import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { HeartStraight, ChatCircle, ShareNetwork, BookmarkSimple, Play, SpeakerHigh, SpeakerSlash } from 'phosphor-react-native';
import { FeedItem } from '../../../../types/index';
import { VideoPreview } from './VideoPreview';
import { useResponsiveLayout } from '../../../shared/lib/responsive';
import { useTheme } from '../../../shared/lib/theme';
import { warmAvatarColor } from '../../../../lib/avatarPalette';
import { useToggleRemoteLike, useToggleRemoteBookmark } from '../api/useSupabaseSocial';
import { useAppStore } from '../../../../store/useAppStore';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS, withDelay } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.8,
  shadowRadius: 2,
  elevation: 3,
};

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.75)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function ActionButton({ icon: Icon, color = '#fff', weight = 'regular', label, onPress, size = 34 }: any) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center' }}>
      <View style={SHADOW}>
        <Icon size={size} color={color} weight={weight} />
      </View>
      {!!label && (
        <Text style={{ 
          color: '#fff', 
          fontSize: 13, 
          marginTop: 6,
          fontWeight: '600',
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
  const router = useRouter();
  
  const height = layout.height;
  const { mutate: toggleLike } = useToggleRemoteLike();
  const { mutate: toggleBookmark } = useToggleRemoteBookmark();
  
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
    
    // Trigger haptics
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Run animation
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

    // Persist like
    if (!item.isLiked) {
      toggleLike({ echoId: item.id, like: true });
    }
  }, [item.isLiked, item.id, toggleLike, heartScale, heartOpacity]);

  const onSingleTap = useCallback(() => {
    setSoundEnabled(!soundEnabled);
    
    // Show mute/unmute indicator briefly
    muteScale.value = 0.5;
    muteOpacity.value = 1;
    
    muteScale.value = withSpring(1, { damping: 15 });
    muteOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(800, withTiming(0, { duration: 300 }))
    );
  }, [soundEnabled, setSoundEnabled, muteScale, muteOpacity]);

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onStart(() => {
      runOnJS(onSingleTap)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onStart((e) => {
      runOnJS(onDoubleTap)(e.x, e.y);
    });

  // Exclusive tap gesture: require single tap to wait for double tap to fail
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
    <View style={{ height, width: '100%', backgroundColor: colors.bg }}>
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill}>
          <VideoPreview
            uri={item.videoUri}
            height={height}
            borderRadius={0}
            echoId={item.id}
            viewCount={item.viewCount}
          />
        </View>
      </GestureDetector>

      {/* Floating Double Tap Heart */}
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute',
        left: heartPos.x,
        top: heartPos.y,
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOW,
      }, heartStyle]}>
        <HeartStraight weight="fill" color={colors.danger} size={120} />
      </Animated.View>

      {/* Floating Mute Indicator */}
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute',
        top: '40%',
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 24,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }, muteStyle]}>
        {!soundEnabled ? (
          <SpeakerSlash color="#fff" size={48} weight="fill" />
        ) : (
          <SpeakerHigh color="#fff" size={48} weight="fill" />
        )}
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          paddingTop: 60,
          paddingBottom: layout.bottomChromePadding + 20,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          pointerEvents: 'box-none'
        }}
      >
        <View style={{ flex: 1, paddingRight: 20 }}>
          <Pressable onPress={() => router.push(`/user/${item.userId}`)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ 
              width: 44, height: 44, borderRadius: 22, 
              backgroundColor: avatarColor, overflow: 'hidden', 
              marginRight: 12,
              borderWidth: 1.5, borderColor: '#fff',
              ...SHADOW
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
            </View>
            <Text style={[font.bodySemibold, { color: '#fff', fontSize: 16, ...TEXT_SHADOW }]}>{item.displayName}</Text>
          </Pressable>
          
          {!!item.editorialTitle && (
            <Text style={[font.bodySemibold, { color: '#fff', fontSize: 15, marginBottom: 8, ...TEXT_SHADOW }]} numberOfLines={2}>
              {item.editorialTitle}
            </Text>
          )}
          
          <Text style={[font.bodyMedium, { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20, ...TEXT_SHADOW }]} numberOfLines={3}>
            {item.prompt}
          </Text>
        </View>

        <View style={{ alignItems: 'center', gap: 24 }}>
          <ActionButton 
            icon={HeartStraight} 
            color={item.isLiked ? colors.danger : '#fff'} 
            weight={item.isLiked ? 'fill' : 'regular'} 
            label={formatCount(item.likes)}
            onPress={() => toggleLike({ echoId: item.id, like: !item.isLiked })}
          />
          <ActionButton 
            icon={ChatCircle} 
            label={formatCount(item.commentCount)}
            onPress={() => router.push(`/thread/${item.id}`)}
          />
          <ActionButton 
            icon={BookmarkSimple} 
            color={item.isBookmarked ? '#FBBF24' : '#fff'}
            weight={item.isBookmarked ? 'fill' : 'regular'}
            label="Save"
            onPress={() => toggleBookmark({ echoId: item.id, bookmark: !item.isBookmarked })}
          />
          <ActionButton 
            icon={ShareNetwork} 
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
