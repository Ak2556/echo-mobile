import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CornersOut, Pause, Play, SlidersHorizontal, SpeakerHigh, SpeakerSlash } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

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
  const videoRef = useRef<VideoView>(null);

  const [activeUri, setActiveUri] = useState(uri);
  const player = useVideoPlayer(activeUri, p => {
    p.muted = true;
    p.loop = false;
  });
  // Three-state load: 'loading' → 'ready' → 'error'
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const qualityList: QualityOption[] = qualities?.length
    ? qualities
    : [{ label: 'Auto', uri }];

  const activeLabel = qualityList.find(q => q.uri === activeUri)?.label ?? 'Auto';

  useEffect(() => {
    setActiveUri(uri);
  }, [uri]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setLoadState('ready');
      if (status === 'error') setLoadState('error');
    });
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
    });
    const endSub = player.addListener('playToEnd', () => {
      player.replay();
      player.pause();
      setPlaying(false);
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
      endSub.remove();
    };
  }, [player]);

  // ── Safety-net: if metadata never loads within 12 s, show error ────────
  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => {
      setLoadState(s => s === 'loading' ? 'error' : s);
    }, 12000);
    return () => clearTimeout(t);
  }, [activeUri, loadState]);

  // ── Actions ────────────────────────────────────────────────────────────
  const togglePlay = async () => {
    if (loadState === 'loading') return;
    try {
      if (playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch {}
  };

  const toggleMute = async () => {
    try {
      setMuted(m => !m);
    } catch {}
  };

  const openFullscreen = async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.enterFullscreen();
    } catch {}
  };

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

          const pos = player.currentTime;
          setLoadState('loading');
          setActiveUri(chosen.uri);

          setTimeout(async () => {
            try {
              player.currentTime = pos;
              if (playing) player.play();
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
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>{`Couldn't load video`}</Text>
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
            <VideoView
              ref={videoRef}
              player={player}
              style={{ flex: 1 }}
              contentFit="cover"
              nativeControls={false}
              fullscreenOptions={{ enable: true }}
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

            {/* ── Centre tap: play / pause ─────────────────────────── */}
            {loadState === 'ready' && (
              <Pressable
                onPress={togglePlay}
                style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
              >
                {!playing && (
                  <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={30} color="#fff" weight="fill" />
                  </View>
                )}
              </Pressable>
            )}

            {/* ── Top-right: quality + fullscreen ─────────────────── */}
            {loadState === 'ready' && (
              <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable
                  onPress={pickQuality}
                  style={[PILL, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }]}
                >
                  <SlidersHorizontal size={13} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.2 }}>{activeLabel}</Text>
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
