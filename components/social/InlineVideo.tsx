import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { CornersOut, DownloadSimple, Pause, Play, SlidersHorizontal, SpeakerHigh, SpeakerSlash } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { saveToMediaLibrary } from '../../lib/mediaUtils';

export interface QualityOption {
  label: string;
  uri: string;
}

interface InlineVideoProps {
  uri: string;
  caption?: string;
  height?: number;
  qualities?: QualityOption[];
}

const PILL = {
  padding: 8,
  borderRadius: 20,
  backgroundColor: 'rgba(0,0,0,0.65)',
} as const;

export function InlineVideo({ uri, caption, height = 260, qualities }: InlineVideoProps) {
  const { colors, radius, fontSizes } = useTheme();
  const dataSaver = useAppStore(s => s.dataSaver);
  const videoRef = useRef<Video>(null);

  const [activeUri, setActiveUri] = useState(uri);
  // Three-state load: 'loading' → 'ready' → 'error'
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(true);

  const qualityList: QualityOption[] = qualities?.length
    ? qualities
    : [{ label: 'Auto', uri }];

  const activeLabel = qualityList.find(q => q.uri === activeUri)?.label ?? 'Auto';

  // ── Safety-net: if metadata never loads within 12 s, show error ────────
  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => {
      setLoadState(s => s === 'loading' ? 'error' : s);
    }, 12000);
    return () => clearTimeout(t);
  }, [activeUri, loadState]);

  // ── Single source of truth for all playback state ──────────────────────
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // error field may or may not exist depending on expo-av version
      const hasError = 'error' in status && !!status.error;
      if (hasError) setLoadState('error');
      return;
    }
    // Video metadata is loaded — show the player
    setLoadState('ready');
    setPlaying(status.isPlaying);
    setBuffering(status.isBuffering);

    if (status.didJustFinish) {
      videoRef.current?.setPositionAsync(0);
      setPlaying(false);
    }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────
  const togglePlay = async () => {
    if (!videoRef.current || loadState === 'loading') return;
    try {
      if (playing) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    } catch {}
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.setIsMutedAsync(!muted);
      setMuted(m => !m);
    } catch {}
  };

  const openFullscreen = async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.presentFullscreenPlayer();
    } catch {}
  };

  const handleSave = () => saveToMediaLibrary([activeUri]);

  const pickQuality = async () => {
    if (qualityList.length <= 1) return;
    const labels = [...qualityList.map(q => q.label), 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Video Quality', options: labels, cancelButtonIndex: labels.length - 1 },
        async (idx) => {
          if (idx === labels.length - 1) return;
          const chosen = qualityList[idx];
          if (chosen.uri === activeUri) return;

          let pos = 0;
          try {
            const s = await videoRef.current?.getStatusAsync();
            if (s?.isLoaded) pos = s.positionMillis;
          } catch {}

          setLoadState('loading');
          setActiveUri(chosen.uri);

          setTimeout(async () => {
            try {
              await videoRef.current?.setPositionAsync(pos);
              if (playing) await videoRef.current?.playAsync();
            } catch {}
          }, 500);
        },
      );
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {!!caption && (
        <Text
          style={{ color: colors.text, fontSize: fontSizes.body, marginBottom: 10, lineHeight: fontSizes.body * 1.5 }}
          numberOfLines={3}
        >
          {caption}
        </Text>
      )}

      <View style={{ height, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' }}>
        {loadState === 'error' ? (
          /* ── Error ───────────────────────────────────────────────── */
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.surfaceHover }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>Couldn't load video</Text>
            <Pressable
              onPress={() => { setLoadState('loading'); setActiveUri(uri); }}
              style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.accent }}
            >
              <Text style={{ color: '#fff', fontSize: fontSizes.small, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── Video element — always mounted so it starts loading ── */}
            <Video
              ref={videoRef}
              source={{ uri: activeUri }}
              style={{ flex: 1 }}
              resizeMode={ResizeMode.COVER}
              isMuted={muted}
              shouldPlay={false}
              useNativeControls={false}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            />

            {/* ── Initial loading spinner (full overlay, blocks nothing — no play yet) ── */}
            {loadState === 'loading' && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: fontSizes.caption, marginTop: 10 }}>
                  Loading…
                </Text>
              </View>
            )}

            {/* ── Buffering spinner (small, bottom-left — controls still usable) ── */}
            {loadState === 'ready' && buffering && playing && (
              <View style={{ position: 'absolute', bottom: 12, left: 12 }}>
                <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" />
              </View>
            )}

            {/* ── Centre tap: play / pause ─────────────────────────── */}
            {loadState === 'ready' && (
              <Pressable
                onPress={togglePlay}
                style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
              >
                {!playing && (
                  <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={30} color="#fff" weight="fill" />
                    </View>
                    {dataSaver && (
                      <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>Tap to play · Data Saver on</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            )}

            {/* ── Top-right: quality + fullscreen + save ───────────── */}
            {loadState === 'ready' && (
              <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable
                  onPress={pickQuality}
                  style={[PILL, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }]}
                >
                  <SlidersHorizontal size={13} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.2 }}>{activeLabel}</Text>
                </Pressable>
                <Pressable onPress={handleSave} style={PILL} accessibilityLabel="Save video" accessibilityRole="button">
                  <DownloadSimple size={16} color="#fff" />
                </Pressable>
                <Pressable onPress={openFullscreen} style={PILL}>
                  <CornersOut size={16} color="#fff" />
                </Pressable>
              </View>
            )}

            {/* ── Bottom-right: pause + mute ───────────────────────── */}
            {loadState === 'ready' && (
              <View style={{ position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 8 }}>
                {playing && (
                  <Pressable onPress={togglePlay} style={PILL}>
                    <Pause size={16} color="#fff" />
                  </Pressable>
                )}
                <Pressable onPress={toggleMute} style={PILL}>
                  {muted ? <SpeakerSlash size={16} color="#fff" /> : <SpeakerHigh size={16} color="#fff" />}
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}
