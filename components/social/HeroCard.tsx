import React from 'react';
import { View, Text, Pressable, Dimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/theme';
import { FeedItem } from '../../types';

const { width: SW } = Dimensions.get('window');
export const HERO_CARD_WIDTH = SW * 0.72;
export const HERO_CARD_HEIGHT = HERO_CARD_WIDTH * 1.44;

interface HeroCardProps {
  item: FeedItem;
  onPress?: () => void;
}

export function HeroCard({ item, onPress }: HeroCardProps) {
  const { colors } = useTheme();

  const hasImage = (item.mediaUris?.length ?? 0) > 0;

  const likeLabel =
    (item.likes ?? 0) >= 1000
      ? `${((item.likes ?? 0) / 1000).toFixed(1)}k`
      : String(item.likes ?? 0);

  const viewLabel =
    (item.viewCount ?? 0) >= 1000
      ? `${Math.floor((item.viewCount ?? 0) / 1000)}k`
      : String(item.viewCount ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: HERO_CARD_WIDTH,
        height: HERO_CARD_HEIGHT,
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      {/* Background — image or gradient */}
      {hasImage ? (
        <Image
          source={{ uri: item.mediaUris![0] }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <LinearGradient
          colors={[item.avatarColor ?? colors.accent, '#0a0a0a']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

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

      {/* Author row — top */}
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

        {/* Glass Follow button */}
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.13)',
            borderRadius: 20,
            paddingHorizontal: 13,
            paddingVertical: 5,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Follow</Text>
        </View>
      </View>

      {/* Bottom content */}
      <View style={{ position: 'absolute', bottom: 18, left: 16, right: 16 }}>
        {/* Badge + stats row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <View
            style={{
              backgroundColor: colors.accent,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
              ECHO
            </Text>
          </View>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
            {likeLabel} · {viewLabel}
          </Text>
        </View>

        {/* Big bold title */}
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
      </View>
    </Pressable>
  );
}
