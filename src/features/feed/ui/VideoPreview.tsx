import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Play, WifiSlash } from 'phosphor-react-native';
import { videoSourceForUri } from '../../../../lib/videoMedia';
import { useAppStore } from '../../../../store/useAppStore';
import { useActiveVideoStore } from '../../../../store/useActiveVideoStore';
import { ttx } from '../../../shared/lib/i18n';
import { WebView } from 'react-native-webview';
import { useIsFocused } from '@react-navigation/native';

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
  /**
   * The echo this video belongs to. Playback follows the active-video store,
   * so only the one video the user is actually looking at plays.
   */
  echoId?: string;
  /**
   * Play without participating in the active-video store. Only for a surface
   * showing exactly one video that has no echo yet — the composer preview.
   *
   * Omitting echoId used to imply this, which meant a grid of videos each
   * decided it was active and they all played at once, audio and all. Opting
   * in explicitly makes that impossible to do by accident.
   */
  autoplay?: boolean;
  /**
   * User-initiated pause. Separate from `isActive`, which only says whether
   * this is the video on screen — a paused video is still the active one, and
   * must stay paused until the user says otherwise.
   */
  paused?: boolean;
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
function VideoFallback({ height = 260, borderRadius = 16, onPress, viewCount, echoId }: VideoPreviewProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} pointerEvents={onPress ? 'auto' : 'box-none'} style={{ height, borderRadius, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#2A2018', '#1A1512', '#0C0B09']}
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
function VideoPlayer({ uri, height = 260, borderRadius = 16, onPress, viewCount, echoId, autoplay = false, paused = false }: VideoPreviewProps) {
  const { VideoView, useVideoPlayer } = ExpoVideoModule!;
  const [loadState, setLoadState] = useState<VideoLoadState>('loading');
  const player = useVideoPlayer(videoSourceForUri(uri), (p: any) => { p.muted = true; p.loop = true; });

  const activeEchoId = useActiveVideoStore(s => s.activeEchoId);
  const soundEnabled = useAppStore(s => s.soundEnabled);
  const isGlobalMuted = !soundEnabled;
  const isFocused = useIsFocused();

  const appState = useRef(AppState.currentState);
  const [isAppActive, setIsAppActive] = useState(appState.current === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      setIsAppActive(nextAppState === 'active');
    });
    return () => sub.remove();
  }, []);

  const isActive = isFocused && isAppActive && (echoId ? activeEchoId === echoId : autoplay);
  // Playback is driven by effects, so a user pause has to be part of the
  // condition rather than a one-off player.pause() — otherwise the next effect
  // run (a mute toggle, a status change, a re-render) restarts the video and
  // the pause looks broken.
  const shouldPlay = isActive && !paused;

  useEffect(() => { setLoadState('loading'); }, [uri]);

  useEffect(() => {
    player.muted = isGlobalMuted || !isActive;
    if (loadState === 'ready') {
      if (shouldPlay) player.play();
      else player.pause();
    }
  }, [shouldPlay, isActive, isGlobalMuted, loadState, player]);

  useEffect(() => {
    const initialState = loadStateFromStatus(player.status);
    if (initialState) {
      setLoadState(initialState);
      if (initialState === 'ready' && shouldPlay) player.play();
    }

    const sub = player.addListener('statusChange', ({ status, error }: { status: string; error?: { message?: string } }) => {
      const nextState = loadStateFromStatus(status);
      if (!nextState) return;
      if (nextState === 'ready') {
        if (shouldPlay) player.play();
        else player.pause();
      }
      if (nextState === 'error' && __DEV__) {
        console.warn('[video-preview] load failed', error?.message ?? uri);
      }
      setLoadState(nextState);
    });
    return () => sub.remove();
  }, [player, uri, shouldPlay]);

  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), VIDEO_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loadState, uri]);

  return (
    <Pressable onPress={onPress} disabled={!onPress} pointerEvents={onPress ? 'auto' : 'box-none'} style={{ height, borderRadius, overflow: 'hidden', backgroundColor: '#09090B' }}>
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
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          {isActive && (
            <WebView
              source={{
                html: `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                      <style>
                        body { margin: 0; padding: 0; background-color: #09090B; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                        video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
                      </style>
                    </head>
                    <body>
                      <video src="${uri}" autoplay loop playsinline webkit-playsinline></video>
                    </body>
                  </html>
                `
              }}
              style={{ flex: 1, backgroundColor: '#09090B' }}
              scrollEnabled={false}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
            />
          )}
          {/* Invisible overlay to catch taps instead of the webview */}
          <View style={{ position: 'absolute', inset: 0 }} />
        </View>
      )}

      {/* Bottom scrim only — the video autoplays, so no persistent play chip
          and no full-frame dim. Overlaid card text stays legible via this band. */}
      <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }} pointerEvents="none" />

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
    <Pressable onPress={onPress} disabled={!onPress} pointerEvents={onPress ? 'auto' : 'box-none'} style={{ height, borderRadius, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#2A2018', '#1A1512', '#0C0B09']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <WifiSlash color="rgba(255,255,255,0.5)" size={24} />
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' }}>{ttx("Video paused — Data Saver on")}</Text>
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
