import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { getDeviceTier } from '../../lib/deviceTier';
import { useVideoProbe, probeReset } from '../../lib/devVideoProbe';

/**
 * THROWAWAY — dev-only HUD for the video smoothness investigation.
 *
 * Renders nothing outside __DEV__. Delete with lib/devVideoProbe.ts when the
 * question is answered.
 *
 * Four numbers, chosen because each one discriminates between a different
 * cause:
 *
 *   PLAYERS  live / peak / created
 *            The hypothesis under test. If peak is 1 while scrolling, player
 *            concurrency is NOT the problem and the fix is a transcode ladder,
 *            not a lifecycle change. If peak is 3-5, it is.
 *
 *   TIER     what getDeviceTier() actually resolved to on THIS device
 *            A slow phone classified 'mid' is a tiering bug, not a video bug —
 *            lib/deviceTier.ts decides by OS version, which is a proxy that can
 *            be wrong for cheap new handsets running a current Android.
 *
 *   JS FPS   frames the JS thread managed in the last second
 *            Low JS FPS with a low player count means the jank is React work
 *            (re-renders, list virtualisation), not decoding.
 *
 *   DROPS    consecutive frames slower than 32ms (i.e. under ~30fps)
 *            Distinguishes a steady low frame rate from intermittent stalls;
 *            they have different causes and different fixes.
 *
 * Note on what this cannot see: the UI/native thread. A requestAnimationFrame
 * loop only measures the JS thread, so smooth JS FPS with visible stutter means
 * the cost is native — decode or compositing — and that is itself a finding.
 */
export function VideoProbeOverlay() {
  const probe = useVideoProbe();
  const [fps, setFps] = useState(0);
  const [drops, setDrops] = useState(0);
  const [tier] = useState(() => {
    try { return getDeviceTier(); } catch { return 'unknown'; }
  });

  const frames = useRef(0);
  const last = useRef(Date.now());
  const lastFrame = useRef(Date.now());
  const dropped = useRef(0);

  useEffect(() => {
    if (!__DEV__) return;
    let raf: number;
    const tick = () => {
      const now = Date.now();
      if (now - lastFrame.current > 32) dropped.current += 1;
      lastFrame.current = now;
      frames.current += 1;

      if (now - last.current >= 1000) {
        setFps(frames.current);
        setDrops(dropped.current);
        frames.current = 0;
        dropped.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!__DEV__) return null;

  const warn = probe.live > 1 || fps < 45;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 60, left: 8, zIndex: 9999 }}
    >
      <Pressable
        onPress={probeReset}
        style={{
          backgroundColor: warn ? 'rgba(180,0,0,0.85)' : 'rgba(0,0,0,0.75)',
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
          {`PLAYERS live ${probe.live}  peak ${probe.peak}  made ${probe.created}`}
        </Text>
        <Text style={{ color: '#fff', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
          {`TIER ${tier}   JS FPS ${fps}   SLOW FRAMES ${drops}/s`}
        </Text>
        <Text style={{ color: '#bbb', fontSize: 9, marginTop: 2 }}>tap to reset counters</Text>
      </Pressable>
    </View>
  );
}
