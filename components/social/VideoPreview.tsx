import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Play, WifiSlash } from 'phosphor-react-native';
import { videoSourceForUri } from '../../lib/videoMedia';
import { useAppStore } from '../../store/useAppStore';

// Safely attempt to load expo-video (unavailable in Expo Go).
// In Expo Go this stays null and we render the static fallback.
let ExpoVideoModule: { VideoView: any; useVideoPlayer: any } | null = null;
try {
  // Dynamic require is required: expo-video's native module is absent in Expo
  // Go, where a static import would throw at module load. The catch renders a
  // static fallback instead.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoVideoModule = require('expo-video');
} catch {}

interface VideoPreviewProps {
  uri: string;
  height?: number;
  borderRadius?: number;
  onPress?: () => void;
  viewCount?: number;
}

const VIDEO_PREVIEW_TIMEOUT_MS = 45_000;

type VideoLoadState = 'loading' | 'ready' | 'error';

function loadStateFromStatus(status: string | undefined): VideoLoadState | null {
  if (status === 'readyToPlay') return 'ready';
  if (status === 'error') return 'error';
  if (status === 'loading' || status === 'idle') return 'loading';
  return null;
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// Static fallback (Expo Go / no native module)
function VideoFallback({ height = 260, borderRadius = 16, onPress, viewCount }: VideoPreviewProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ height, borderRadius, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#1E1B4B', '#312E81', '#0A0A0A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Play color="#fff" size={24} weight="fill" />
        </View>
      </LinearGradient>

      {viewCount !== undefined && (
        <View style={{
          position: 'absolute', bottom: 10, left: 10,
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 8, paddingVertical: 4,
          borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)',
        }}>
          <Eye size={13} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{formatViewCount(viewCount)}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Full video player (dev client / production build)
function VideoPlayer({ uri, height = 260, borderRadius = 16, onPress, viewCount }: VideoPreviewProps) {
  const { VideoView, useVideoPlayer } = ExpoVideoModule!;
  const [loadState, setLoadState] = useState<VideoLoadState>('loading');
  const player = useVideoPlayer(videoSourceForUri(uri), (p: any) => { p.muted = true; p.loop = true; });

  useEffect(() => { setLoadState('loading'); }, [uri]);

  useEffect(() => {
    const initialState = loadStateFromStatus(player.status);
    if (initialState) {
      setLoadState(initialState);
      if (initialState === 'ready') player.play();
    }

    const sub = player.addListener('statusChange', ({ status, error }: { status: string; error?: { message?: string } }) => {
      const nextState = loadStateFromStatus(status);
      if (!nextState) return;
      if (nextState === 'ready') player.play();
      if (nextState === 'error' && __DEV__) {
        console.warn('[video-preview] load failed', error?.message ?? uri);
      }
      setLoadState(nextState);
    });
    return () => sub.remove();
  }, [player, uri]);

  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), VIDEO_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loadState, uri]);

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ height, borderRadius, overflow: 'hidden', backgroundColor: '#09090B' }}>
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setLoadState('ready')}
      />

      {loadState === 'loading' && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {loadState === 'error' && (
        <LinearGradient colors={['#3730A3', '#0A0A0A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Play color="#fff" size={24} weight="fill" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>Tap to open video</Text>
        </LinearGradient>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.72)']} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="none" />

      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' }}>
        <Play color="#fff" size={24} weight="fill" />
      </View>

      {viewCount !== undefined && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <Eye size={13} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{formatViewCount(viewCount)}</Text>
        </View>
      )}
    </Pressable>
  );
}

function DataSaverPlaceholder({ height = 260, borderRadius = 16, onPress, viewCount }: VideoPreviewProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ height, borderRadius, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#1E1B4B', '#312E81', '#0A0A0A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <WifiSlash color="rgba(255,255,255,0.5)" size={24} />
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' }}>Video paused — Data Saver on</Text>
      </LinearGradient>
      {viewCount !== undefined && (
        <View style={{ position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <Eye size={13} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : `${viewCount}`}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Public export — auto-selects based on native module availability and Data Saver flag
export function VideoPreview(props: VideoPreviewProps) {
  const dataSaver = useAppStore(s => s.dataSaver);
  if (dataSaver) return <DataSaverPlaceholder {...props} />;
  if (!ExpoVideoModule) return <VideoFallback {...props} />;
  return <VideoPlayer {...props} />;
}
