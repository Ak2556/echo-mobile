import React, { useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../../lib/theme';

// Lazy-load expo-av to avoid crashing if the native module is unavailable
const getAV = () => {
  try { return require('expo-av'); } catch { return null; }
};

interface InlineVideoProps {
  uri: string;
  caption?: string;
}

export function InlineVideo({ uri, caption }: InlineVideoProps) {
  const { colors, radius, fontSizes } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<any>(null);

  const av = getAV();
  const VideoComponent = av?.Video;

  const handlePress = useCallback(async () => {
    if (!VideoComponent || !videoRef.current) return;
    try {
      if (playing) {
        await videoRef.current.pauseAsync();
        setPlaying(false);
      } else {
        setLoading(true);
        await videoRef.current.playAsync();
        setPlaying(true);
      }
    } catch {
      setError(true);
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [playing, VideoComponent]);

  return (
    <View style={{ marginBottom: 12 }}>
      {!!caption && (
        <Text style={{ color: colors.text, fontSize: fontSizes.body, marginBottom: 10 }} numberOfLines={2}>{caption}</Text>
      )}
      <Pressable
        onPress={handlePress}
        style={{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000', height: 220 }}
      >
        {VideoComponent ? (
          <VideoComponent
            ref={videoRef}
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            isLooping
            isMuted={false}
            shouldPlay={false}
            onLoadStart={() => setLoading(true)}
            onReadyForDisplay={() => setLoading(false)}
            onError={() => { setError(true); setLoading(false); }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Video playback unavailable</Text>
          </View>
        )}

        {/* Overlay — play/pause button */}
        {!error && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', inset: 0,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: playing ? 'transparent' : 'rgba(0,0,0,0.3)',
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : !playing ? (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                {/* Play triangle */}
                <View style={{ width: 0, height: 0, borderTopWidth: 12, borderBottomWidth: 12, borderLeftWidth: 20, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 4 }} />
              </View>
            ) : null}
          </View>
        )}

        {error && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHover }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Unable to load video</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
