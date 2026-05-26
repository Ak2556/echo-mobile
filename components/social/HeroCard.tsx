import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Heart, Eye, PlayCircle, Camera } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';
import { VideoPreview } from './VideoPreview';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { usePerformanceProfile } from '../../lib/performance';

const { width: SW } = Dimensions.get('window');
export const HERO_CARD_WIDTH = SW * 0.72;
export const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.44;

interface HeroCardProps {
  item: FeedItem;
  onPress?: () => void;
  scrollX?: SharedValue<number>;
  cardIndex?: number;
}

export function HeroCard({ item, onPress, scrollX, cardIndex = 0 }: HeroCardProps) {
  const { colors, reduceAnimations } = useTheme();
  const performance = usePerformanceProfile('hero');

  const hasImage = (item.mediaUris?.length ?? 0) > 0;
  const hasVideo = item.postType === 'video' && !!item.videoUri;

  const likeLabel =
    (item.likes ?? 0) >= 1000
      ? `${((item.likes ?? 0) / 1000).toFixed(1)}k`
      : String(item.likes ?? 0);

  const viewLabel =
    (item.viewCount ?? 0) >= 1000
      ? `${Math.floor((item.viewCount ?? 0) / 1000)}k`
      : String(item.viewCount ?? 0);

  const useBlur = performance.useBlur;

  // Parallax: image layer moves at 0.35x inverse of scroll
  const CARD_STEP = HERO_CARD_WIDTH + 12;
  const parallaxStyle = useAnimatedStyle(() => {
    if (!scrollX || reduceAnimations || !performance.listAnimations) return { transform: [{ translateX: 0 }] };
    const cardOffset = cardIndex * CARD_STEP;
    const dx = interpolate(
      scrollX.value - cardOffset,
      [-CARD_STEP, 0, CARD_STEP],
      [CARD_STEP * 0.35, 0, -CARD_STEP * 0.35],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateX: dx }] };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      depth="soft"
      fadeOnPress
      performanceMode="hot"
      style={{
        width: HERO_CARD_WIDTH,
        height: HERO_CARD_HEIGHT,
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      {/* Background with parallax */}
      <Animated.View style={[StyleSheet.absoluteFill, { width: HERO_CARD_WIDTH * 1.3, left: -HERO_CARD_WIDTH * 0.15 }, parallaxStyle]}>
        {hasVideo ? (
          <VideoPreview
            uri={item.videoUri!}
            height={HERO_CARD_HEIGHT}
            borderRadius={0}
          />
        ) : hasImage ? (
          <Image
            source={{ uri: item.mediaUris![0] }}
            style={[StyleSheet.absoluteFill]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={[item.avatarColor ?? colors.accent, '#0a0a0a']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Top scrim */}
      <LinearGradient
        colors={['rgba(0,0,0,0.62)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }}
        pointerEvents="none"
      />

      {/* Bottom scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.96)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 210 }}
        pointerEvents="none"
      />

      {/* Author row — glass pill */}
      <View
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: item.avatarColor ?? colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            {(item.displayName || item.username).charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
            {item.displayName || item.username}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
            {(item.likes ?? 0).toLocaleString()} likes
          </Text>
        </View>

        {/* Frosted glass Follow button */}
        <View
          style={{
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.35)',
          }}
        >
          {useBlur ? (
            <>
              <BlurView intensity={performance.maxBlurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          )}
          <View style={{ paddingHorizontal: 13, paddingVertical: 5 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Follow</Text>
          </View>
        </View>
      </View>

      {/* Bottom content — frosted glass panel */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
        {useBlur && (
          <BlurView intensity={performance.maxBlurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: useBlur ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.65)' },
          ]}
        />
        {/* Top glass edge */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}
        />
        <View style={{ padding: 16 }}>
          {/* Meta row — post-type chip + counts. Counts render with icons
              instead of bare numbers; both hide when 0 so the row collapses
              to just the type chip on fresh posts. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.accent,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              {hasVideo
                ? <PlayCircle color="#fff" size={11} weight="fill" />
                : hasImage
                  ? <Camera color="#fff" size={11} weight="fill" />
                  : null}
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
                {hasVideo ? 'VIDEO' : hasImage ? 'PHOTO' : 'ECHO'}
              </Text>
            </View>

            {(item.likes ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Heart color="rgba(255,255,255,0.72)" size={12} weight="fill" />
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontVariant: ['tabular-nums'] }}>
                  {likeLabel}
                </Text>
              </View>
            )}
            {(item.viewCount ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Eye color="rgba(255,255,255,0.72)" size={12} weight="regular" />
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontVariant: ['tabular-nums'] }}>
                  {viewLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Prompt — kept uppercase but capped to display the user's text
              naturally if it's already title-cased. */}
          <Text
            style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: '900',
              textTransform: 'uppercase',
              lineHeight: 27,
              letterSpacing: -0.4,
            }}
            numberOfLines={2}
          >
            {item.prompt}
          </Text>
          {/* Bottom padding */}
          <View style={{ height: 6 }} />
        </View>
      </View>
    </AnimatedPressable>
  );
}
