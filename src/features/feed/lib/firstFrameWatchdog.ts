import { useEffect, useState } from 'react';

/**
 * Catches a player that reports itself ready and then draws nothing.
 *
 * VideoPreview treated expo-video's `readyToPlay` as proof there was a picture.
 * Its own 45s watchdog is guarded by `loadState === 'loading'`, so arriving at
 * 'ready' cancelled it permanently, and its WebView fallback only runs on
 * 'error'. A decoder that succeeds and produces no frames therefore hid the
 * spinner, never reached the fallback, and left a black rectangle with no
 * recovery path — the player is not stuck, so nothing ever fires again.
 *
 * Observed on an Android emulator with a 1920x1080 HEVC Main clip: the status
 * reached readyToPlay while Echo's process held c2.goldfish.hevc.decoder and
 * nothing was drawn. The frame one second in averages RGB(172,182,193), so the
 * source is a bright sky — the black came from the renderer.
 *
 * The trigger was HEVC, and half the stored feed videos are HEVC because
 * expo-image-picker's `videoExportPreset` is iOS-only and Android uploads the
 * camera's original file. But this does not test for a codec: "ready without a
 * frame" is the failure whatever causes it, and a codec allowlist would go
 * stale the moment a device disagreed with it. Escalating to 'error' hands the
 * clip to the WebView fallback, which decodes through the system WebView rather
 * than the native player and often succeeds where it failed.
 *
 * Deliberately not armed during 'loading' — that state has its own, longer
 * watchdog, and arming this one there as well would cut a slow-but-healthy
 * download short and send it to the fallback for no reason.
 */

/**
 * How long a "ready" player may draw nothing before it is treated as stalled.
 *
 * Long enough that a first frame still arriving over a slow connection is not
 * mistaken for a dead decoder, short enough that nobody studies a black square
 * wondering whether the app is broken.
 */
export const FIRST_FRAME_GRACE_MS = 7000;

/**
 * @param ready      the player reports it can play
 * @param sawFrame   a frame has actually been rendered
 * @returns          true once `ready` has held for the grace period with no frame
 */
export function useFirstFrameWatchdog(ready: boolean, sawFrame: boolean): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    // Any move away from "ready and frameless" clears a previous verdict, so a
    // recycled card cannot inherit the stall of the video before it.
    if (!ready || sawFrame) {
      setStalled(false);
      return;
    }

    setStalled(false);
    const timer = setTimeout(() => setStalled(true), FIRST_FRAME_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready, sawFrame]);

  return stalled;
}
