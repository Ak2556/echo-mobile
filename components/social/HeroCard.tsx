import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Eye, PlayCircle, Camera } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';
import { VideoPreview } from './VideoPreview';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { Avatar } from '../ui/Avatar';
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { usePerformanceProfile } from '../../lib/performance';

export const HERO_CARD_WIDTH = 196;
export const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 0.92;

interface HeroCardProps {
  item: FeedItem;
  onPress?: () => void;
  scrollX?: SharedValue<number>;
  cardIndex?: number;
}

export function HeroCard({ item, onPress, scrollX, cardIndex = 0 }: HeroCardProps) {
  const { colors, font, reduceAnimations } = useTheme();
  const { width } = useWindowDimensions();
  const performance = usePerformanceProfile('hero');
  const cardWidth = Math.min(width * 0.44, 196);
  const cardHeight = cardWidth * 0.92;

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

  // Parallax: image layer moves at 0.35x inverse of scroll
  const CARD_STEP = cardWidth + 12;
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
        width: cardWidth,
        height: cardHeight,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      {/* Background with parallax */}
      <Animated.View style={[StyleSheet.absoluteFill, { width: cardWidth * 1.3, left: -cardWidth * 0.15 }, parallaxStyle]}>
        {hasVideo ? (
          <VideoPreview
            uri={item.videoUri!}
            height={cardHeight}
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
            colors={[item.avatarColor ?? colors.accent, colors.surfaceHover, colors.surface]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Top scrim */}
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 88 }}
        pointerEvents="none"
      />

      {/* Bottom scrim */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.70)', 'rgba(0,0,0,0.88)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 146 }}
        pointerEvents="none"
      />

      {/* Author row */}
      <View
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)' }}>
          <Avatar
            name={item.displayName || item.username}
            color={item.avatarColor}
            url={item.avatarUrl}
            size={22}
            zoomable={false}
          />
        </View>

        <Text style={[font.bodySemibold, { color: '#fff', fontSize: 11, flex: 1 }]} numberOfLines={1}>
          {item.displayName || item.username}
        </Text>
      </View>

      {/* Bottom content */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={{ padding: 10, paddingTop: 24 }}>
          {/* Meta row — post-type chip + counts. Counts render with icons
              instead of bare numbers; both hide when 0 so the row collapses
              to just the type chip on fresh posts. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(255,255,255,0.13)',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.20)',
              }}
            >
              {hasVideo
                ? <PlayCircle color="#fff" size={11} weight="fill" />
                : hasImage
                  ? <Camera color="#fff" size={11} weight="fill" />
                  : null}
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0 }}>
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

          {/* Prompt */}
          <Text
              style={[font.display, {
                color: '#fff',
              fontSize: 15,
              lineHeight: 20,
            }]}
            numberOfLines={2}
          >
            {item.editorialTitle ?? item.prompt}
          </Text>
          {/* Bottom padding */}
          <View style={{ height: 6 }} />
        </View>
      </View>
    </AnimatedPressable>
  );
}
