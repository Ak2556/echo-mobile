import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Play } from 'phosphor-react-native';
import { ttx, useI18n } from '../../lib/i18n/i18n';

interface VideoTileProps {
  height: number;
  borderRadius: number;
  viewCount?: number;
  onPress: () => void;
}

/**
 * How a video post sits in a scrolling feed: a tile, not a player.
 *
 * The feed used to mount a player per video card. On Android the native player
 * errors at once and the fallback is a WebView, one per card, in a list the owner
 * wants smooth; and until a card was the active one it was a plain black box. The
 * tile costs nothing to scroll past, says what it is, and a tap opens the tab for
 * scrolling short video, on this clip (see tapTarget.flowRoute).
 */
export function VideoTile({ height, borderRadius, viewCount, onPress }: VideoTileProps) {
  const { t } = useI18n();
  const place = t('nav.watch');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ttx('Watch')} · ${place}`}
      style={{ height, borderRadius, overflow: 'hidden' }}
    >
      <LinearGradient
        colors={['#0B0B0F', '#1B1B22', '#0B0B0F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Play color="#fff" size={28} weight="fill" />
        </View>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{ttx('Watch')} · {place}</Text>
        {viewCount ? (
          <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Eye color="rgba(255,255,255,0.7)" size={13} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>{viewCount}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}
