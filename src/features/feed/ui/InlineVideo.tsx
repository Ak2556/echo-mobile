import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// Only used on iOS (see the Platform.OS branch below), but a static import runs
// everywhere — and react-native-webview has no web build, so importing it would
// break every screen that renders a video on the website.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView: any = (() => { try { return require('react-native-webview').WebView; } catch { return null; } })();
import { ArrowsClockwise, CornersOut, Pause, Play, SlidersHorizontal, SpeakerHigh, SpeakerSlash } from 'phosphor-react-native';
import { useTheme } from '../../../shared/lib/theme';
import { videoSourceForUri } from '../../../../lib/videoMedia';
import { ttx } from '../../../shared/lib/i18n';

export interface QualityOption { label: string; uri: string; }

interface InlineVideoProps {
  uri: string;
  caption?: string;
  height?: number;
  qualities?: QualityOption[];
  /**
   * Present Echo's full-screen video view. The caller owns the presentation
   * because it holds the FeedItem; this component only signals the intent.
   * Omit it and the full-screen control is hidden rather than falling back to
   * the OS player.
   */
  onRequestFullscreen?: () => void;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];
const PILL = { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.65)' } as const;
const VIDEO_LOAD_TIMEOUT_MS = 45_000;
type VideoLoadState = 'loading' | 'ready' | 'error';

function loadStateFromStatus(status: string | undefined): VideoLoadState | null {
  if (status === 'readyToPlay') return 'ready';
  if (status === 'error') return 'error';
  if (status === 'loading' || status === 'idle') return 'loading';
  return null;
}

function fmt(s: number): string {
  const t = Math.floor(Math.max(0, s));
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

interface InlineVideoInnerProps extends InlineVideoProps {
  onRetry: () => void;
}

function InlineVideoInner({ uri, caption, height = 260, qualities, onRetry, onRequestFullscreen }: InlineVideoInnerProps) {
  const { colors, radius, fontSizes } = useTheme();
  const videoRef = useRef<VideoView>(null);
  const [activeUri, setActiveUri] = useState(uri);
  const player = useVideoPlayer(activeUri);

  const [loadState, setLoadState] = useState<VideoLoadState>('loading');
  const [videoError, setVideoError] = useState<string>('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(1);
  const [showQualityModal, setShowQualityModal] = useState(false);

  const qualityList: QualityOption[] = qualities?.length ? qualities : [{ label: 'Auto', uri }];
  const activeLabel = qualityList.find(q => q.uri === activeUri)?.label ?? 'Auto';
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const thumbLeft = (pct / 100) * barWidth;

  useEffect(() => { setActiveUri(uri); }, [uri]);
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => { player.loop = loop; }, [loop, player]);
  useEffect(() => { try { player.playbackRate = speed; } catch {} }, [speed, player]);

  useEffect(() => {
    const s1 = player.addListener('statusChange', ({ status, error }) => {
      const nextState = loadStateFromStatus(status);
      if (nextState === 'ready') {
        setLoadState('ready');
        if (player.duration > 0) setDuration(player.duration);
      }
      if (nextState === 'error') {
        setLoadState('error');
        if (error) setVideoError(error.message);
      }
      if (nextState === 'loading') setLoadState('loading');
    });
    const s2 = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    const s3 = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      const d = player.duration;
      if (d > 0) setDuration(d);
    });
    const s4 = player.addListener('playToEnd', () => {
      if (!loop) { player.replay(); player.pause(); setPlaying(false); }
    });
    const initialState = loadStateFromStatus(player.status);
    if (initialState) setLoadState(initialState);
    if (player.duration > 0) setDuration(player.duration);
    return () => { s1.remove(); s2.remove(); s3.remove(); s4.remove(); };
  }, [player, loop]);

  useEffect(() => {
    if (loadState !== 'loading') return;
    const t = setTimeout(() => setLoadState(s => s === 'loading' ? 'error' : s), VIDEO_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [activeUri, loadState]);

  const retryLoad = () => {
    setLoadState('loading');
    onRetry();
  };

  const togglePlay = () => { if (loadState !== 'ready') return; try { if (playing) { player.pause(); } else { player.play(); } } catch {} };
  const toggleMute = () => { try { setMuted(m => !m); } catch {} };
  const toggleLoop = () => setLoop(l => !l);
  const cycleSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  /**
   * Hand off to Echo's own full-screen view rather than the OS player.
   *
   * This used to call videoRef.enterFullscreen(), which presents the system
   * video controls — a different visual language from the rest of the app, and
   * a second surface to maintain. The inline player pauses first so audio does
   * not continue underneath the full-screen view.
   *
   * Without a handler the control is not rendered at all; falling back to the
   * OS player would reintroduce exactly the inconsistency this removes.
   */
  const openFullscreen = () => {
    try { player.pause(); } catch {}
    onRequestFullscreen?.();
  };

  const seekTo = (x: number) => {
    if (duration <= 0 || loadState !== 'ready') return;
    try { player.currentTime = Math.max(0, Math.min(1, x / barWidth)) * duration; } catch {}
  };

  const switchQuality = (q: QualityOption) => {
    if (q.uri === activeUri) return;
    const pos = player.currentTime;
    const was = playing;
    setLoadState('loading');
    setActiveUri(q.uri);
    setTimeout(() => { try { player.currentTime = pos; if (was) player.play(); } catch {} }, 500);
  };

  const pickQuality = () => {
    if (qualityList.length <= 1) return;
    if (Platform.OS === 'ios') {
      const opts = [...qualityList.map(q => q.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Video Quality', options: opts, cancelButtonIndex: opts.length - 1 },
        idx => { if (idx < qualityList.length) switchQuality(qualityList[idx]); },
      );
    } else {
      setShowQualityModal(true);
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {!!caption && (
        <Text style={{ color: colors.text, fontSize: fontSizes.body, marginBottom: 10, lineHeight: fontSizes.body * 1.5 }} numberOfLines={3}>
          {caption}
        </Text>
      )}

      <View style={{ height, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' }}>
        {loadState === 'error' ? (
          <WebView
            source={{ uri: activeUri }}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
          />
        ) : (
          <>
            <VideoView
              ref={videoRef}
              player={player}
              style={{ flex: 1 }}
              contentFit="cover"
              // false, matching EchoCard and VideoPreview. This player already
              // draws its own play/pause, seek, mute, speed and quality
              // controls just below, so the native set was a second, competing
              // layer — and on Android its overflow menu offers Download,
              // handing every viewer a way to save someone else's video
              // straight out of the feed.
              nativeControls={false}
              fullscreenOptions={{ enable: false }}
            />

            {loadState === 'loading' && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: fontSizes.caption, marginTop: 10 }}>{ttx("Loading...")}</Text>
              </View>
            )}

            {loadState === 'ready' && (
              <Pressable onPress={togglePlay} style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                {!playing && (
                  <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={30} color="#fff" weight="fill" />
                  </View>
                )}
              </Pressable>
            )}

            {loadState === 'ready' && (
              <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {qualityList.length > 1 && (
                  <Pressable onPress={pickQuality} style={[PILL, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }]}>
                    <SlidersHorizontal size={13} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{activeLabel}</Text>
                  </Pressable>
                )}
                <Pressable onPress={cycleSpeed} style={[PILL, { paddingHorizontal: 10 }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{speed === 1 ? '1x' : `${speed}x`}</Text>
                </Pressable>
                {onRequestFullscreen && (
                  <Pressable
                    onPress={openFullscreen}
                    style={PILL}
                    accessibilityRole="button"
                    accessibilityLabel={ttx('Full screen')}
                  >
                    <CornersOut size={16} color="#fff" />
                  </Pressable>
                )}
              </View>
            )}

            {loadState === 'ready' && (
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' }}>{fmt(position)}</Text>
                  {duration > 0 && <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{fmt(duration)}</Text>}
                </View>

                <View
                  onLayout={e => setBarWidth(Math.max(1, e.nativeEvent.layout.width))}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={e => seekTo(e.nativeEvent.locationX)}
                  onResponderMove={e => seekTo(e.nativeEvent.locationX)}
                  style={{ height: 24, justifyContent: 'center', marginBottom: 6 }}
                >
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${pct}%`, backgroundColor: colors.accent, borderRadius: 2 }} />
                  </View>
                  <View pointerEvents="none" style={{ position: 'absolute', left: thumbLeft - 6, width: 13, height: 13, borderRadius: 7, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 }} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  {playing && <Pressable onPress={togglePlay} style={PILL}><Pause size={16} color="#fff" /></Pressable>}
                  <Pressable onPress={toggleLoop} style={[PILL, loop && { backgroundColor: colors.accent + 'CC' }]}>
                    <ArrowsClockwise size={16} color="#fff" weight={loop ? 'fill' : 'regular'} />
                  </Pressable>
                  <Pressable onPress={toggleMute} style={PILL}>
                    {muted ? <SpeakerSlash size={16} color="#fff" /> : <SpeakerHigh size={16} color="#fff" />}
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {Platform.OS === 'android' && (
        <Modal visible={showQualityModal} transparent animationType="slide" onRequestClose={() => setShowQualityModal(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setShowQualityModal(false)}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 36 }}>
              <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder }} />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20, marginBottom: 4 }}>{ttx("Video Quality")}</Text>
              {qualityList.map((q, i) => {
                const isActive = q.uri === activeUri;
                return (
                  <Pressable key={q.uri + i} onPress={() => { setShowQualityModal(false); switchQuality(q); }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: i < qualityList.length - 1 ? 1 : 0, borderBottomColor: colors.glassBorder }}>
                    <Text style={{ color: isActive ? colors.accent : colors.text, fontSize: 15, fontWeight: isActive ? '700' : '400' }}>{q.label}</Text>
                    {isActive && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

export function InlineVideo(props: InlineVideoProps) {
  const [retryKey, setRetryKey] = useState(0);
  return <InlineVideoInner key={retryKey} {...props} onRetry={() => setRetryKey(k => k + 1)} />;
}
