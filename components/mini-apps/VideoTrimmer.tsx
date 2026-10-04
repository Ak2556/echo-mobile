import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';
import { frameAt, mediaErrorMessage, trimVideo, videoDurationMs } from '../../lib/media/echoMedia';
import { formatClock, isWholeClip, moveEnd, moveStart, type TrimRange } from '../../lib/media/trimRange';
import { showToast } from '../ui/Toast';

const THUMB_W = 16;
const TRACK_H = 56;
const STRIP_FRAMES = 8;

interface VideoTrimmerProps {
  visible: boolean;
  uri: string;
  onCancel: () => void;
  /** The trimmed file, or the original uri when the whole clip was kept. */
  onDone: (uri: string) => void;
}

/**
 * Trim a video: a strip of frames, two handles, and a still of the frame the cut
 * will start (or end) on. The cut itself is the EchoMedia native module's lossless
 * trim, so it is instant but starts on a keyframe, up to a second or two before
 * the handle — the still shows that keyframe, not the time you dragged to.
 *
 * Everything here — length, strip, stills — comes from the file through the
 * native module rather than from a video player. expo-video's player reported
 * nothing usable inside this screen (and Studio's preview of the same file is
 * equally dead), so a preview that plays is left out rather than faked.
 */
export function VideoTrimmer({ visible, uri, onCancel, onDone }: VideoTrimmerProps) {
  const { colors } = useTheme();
  const [durationMs, setDurationMs] = useState(0);
  const [range, setRange] = useState<TrimRange>({ startMs: 0, endMs: 0 });
  const [trackW, setTrackW] = useState(0);
  const [busy, setBusy] = useState(false);
  const [strip, setStrip] = useState<string[]>([]);
  const [stillUri, setStillUri] = useState<string | null>(null);
  const [stillMs, setStillMs] = useState(0);

  useEffect(() => {
    if (!visible || !uri) return;
    let cancelled = false;
    setStrip([]);
    setStillUri(null);
    (async () => {
      let ms = 0;
      try { ms = await videoDurationMs(uri); } catch { return; }
      if (cancelled || !(ms > 0)) return;
      setDurationMs(ms);
      setRange({ startMs: 0, endMs: ms });
      setStillMs(0);
      // Frames arrive one by one so the strip fills in rather than popping in.
      for (let i = 0; i < STRIP_FRAMES; i++) {
        try {
          const frame = await frameAt(uri, ((i + 0.5) / STRIP_FRAMES) * ms, 160);
          if (cancelled) return;
          setStrip((prev) => [...prev, frame]);
        } catch { /* a missing frame just leaves a gap in the strip */ }
      }
    })();
    return () => {
      cancelled = true;
      setDurationMs(0);
      setRange({ startMs: 0, endMs: 0 });
    };
  }, [visible, uri]);

  // The still follows the handle being dragged, latest drag wins.
  useEffect(() => {
    if (!visible || !uri || durationMs <= 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      frameAt(uri, stillMs, 720)
        .then((f) => { if (!cancelled) setStillUri(f); })
        .catch(() => { /* keep the previous still */ });
    }, 90);
    return () => { cancelled = true; clearTimeout(t); };
  }, [visible, uri, durationMs, stillMs]);

  const pxPerMs = durationMs > 0 && trackW > 0 ? trackW / durationMs : 0;
  const startPx = range.startMs * pxPerMs;
  const endPx = range.endMs * pxPerMs;

  // Which handle a touch grabs is decided once, at touch-down: the nearer one.
  const grabbed = useSharedValue(0); // 0 = start, 1 = end
  const startPxShared = useSharedValue(0);
  const endPxShared = useSharedValue(0);
  startPxShared.value = startPx;
  endPxShared.value = endPx;

  const dragTo = useCallback((which: number, x: number) => {
    if (pxPerMs <= 0) return;
    const ms = Math.max(0, Math.min(durationMs, x / pxPerMs));
    setRange((r) => (which === 0 ? moveStart(ms, r, durationMs) : moveEnd(ms, r, durationMs)));
    setStillMs(ms);
  }, [durationMs, pxPerMs]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      grabbed.value = Math.abs(e.x - startPxShared.value) <= Math.abs(e.x - endPxShared.value) ? 0 : 1;
      runOnJS(dragTo)(grabbed.value, e.x);
    })
    .onUpdate((e) => {
      runOnJS(dragTo)(grabbed.value, e.x);
    });

  const rangeRef = useRef(range);
  rangeRef.current = range;

  const confirm = async () => {
    if (isWholeClip(range, durationMs)) { onDone(uri); return; }
    setBusy(true);
    try {
      onDone(await trimVideo(uri, range.startMs, range.endMs));
    } catch (e) {
      showToast(mediaErrorMessage(e), ttx('Trim'));
    } finally {
      setBusy(false);
    }
  };

  const keptMs = range.endMs - range.startMs;
  const ready = durationMs > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 }}>
              <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" disabled={busy}>
                <Text style={{ color: '#fff', fontSize: 17 }}>{ttx('Cancel')}</Text>
              </Pressable>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>{ttx('TRIM')}</Text>
              <Pressable onPress={confirm} hitSlop={10} disabled={!ready || busy} accessibilityRole="button" accessibilityLabel={ttx('Trim video')}>
                {busy
                  ? <ActivityIndicator color={colors.accent} />
                  : <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '600', opacity: ready ? 1 : 0.5 }}>{ttx('Done')}</Text>}
              </Pressable>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
              {stillUri
                ? <Image source={{ uri: stillUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                : <ActivityIndicator color="#fff" />}
            </View>

            {/* 36 keeps the start handle clear of Android's edge back-gesture zone, where a drag at 0:00 closed the screen. */}
            <View style={{ paddingHorizontal: 36, paddingTop: 18, paddingBottom: 24, gap: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] }}>{formatClock(range.startMs)}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontVariant: ['tabular-nums'] }}>
                  {ttx('Keeping')} {formatClock(keptMs)}
                </Text>
                <Text style={{ color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'] }}>{formatClock(range.endMs)}</Text>
              </View>

              <GestureDetector gesture={pan}>
                <View
                  onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
                  style={{ height: TRACK_H, justifyContent: 'center' }}
                  accessibilityLabel={ttx('Trim range')}
                >
                  <View style={{ height: TRACK_H - 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', flexDirection: 'row' }}>
                    {strip.map((f, i) => (
                      <Image key={`${i}-${f}`} source={{ uri: f }} style={{ flex: 1, height: '100%' }} contentFit="cover" />
                    ))}
                    {/* Dim what is being cut away. */}
                    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: startPx, backgroundColor: 'rgba(0,0,0,0.62)' }} />
                    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: endPx, right: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
                  </View>
                  {ready ? (
                    <>
                      <View pointerEvents="none" style={{ position: 'absolute', left: startPx - THUMB_W / 2, top: 0, bottom: 0, width: THUMB_W, borderRadius: 5, backgroundColor: colors.accent }} />
                      <View pointerEvents="none" style={{ position: 'absolute', left: endPx - THUMB_W / 2, top: 0, bottom: 0, width: THUMB_W, borderRadius: 5, backgroundColor: colors.accent }} />
                    </>
                  ) : null}
                </View>
              </GestureDetector>

              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, textAlign: 'center' }}>
                {ttx('Drag either end. The cut starts at the nearest keyframe, so it can begin a moment early.')}
              </Text>
            </View>
          </SafeAreaView>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}
