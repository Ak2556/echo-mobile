import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Play } from 'phosphor-react-native';
import { ttx, useI18n } from '../../lib/i18n/i18n';
import { singleMediaFrame } from '../../lib/media/mediaFrame';
import { useVideoPoster } from '../../lib/media/videoPoster';

interface VideoTileProps {
  /** The clip, to take a frame from. */
  uri: string;
  borderRadius: number;
  viewCount?: number;
  onPress: () => void;
}

/**
 * How a video post sits in a scrolling feed: a still frame with a play button,
 * not a player, in the same frame as a photo post (lib/media/mediaFrame.ts).
 *
 * The feed used to mount a player per video card. On Android the native player
 * errors at once and the fallback is a WebView, one per card, in a list the owner
 * wants smooth; and until a card was the active one it was a plain black box. The
 * tile costs nothing to scroll past, shows what the clip is, and a tap opens the
 * tab for scrolling short video, on this clip (see tapTarget.flowRoute).
 */
export function VideoTile({ uri, borderRadius, viewCount, onPress }: VideoTileProps) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const poster = useVideoPoster(uri);
  const place = t('nav.watch');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ttx('Watch')} · ${place}`}
      style={[{ borderRadius, overflow: 'hidden', backgroundColor: '#0B0B0F' }, singleMediaFrame(width, height)]}
    >
      {poster ? (
        <Image source={poster} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={160} />
      ) : null}
      <LinearGradient
        // Dark enough to carry the white play button and label over any frame; the
        // plain tile is just this gradient while a frame loads or is unavailable.
        colors={poster ? ['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.38)'] : ['#0B0B0F', '#1B1B22', '#0B0B0F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' }}>
          <Play color="#fff" size={28} weight="fill" />
        </View>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>{ttx('Watch')} · {place}</Text>
        {viewCount ? (
          <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Eye color="rgba(255,255,255,0.85)" size={13} />
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>{viewCount}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}
