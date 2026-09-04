import { useEffect, useRef, useState } from 'react';
import { getDeviceTier } from '../../../../lib/deviceTier';

/**
 * Decides whether a video card should hold a native player at all.
 *
 * Why this exists: VideoPreview constructs a player on MOUNT, not when the card
 * becomes active — `isActive` only drives play/pause/mute. In the Flow, which
 * keeps ~3 full-screen cards mounted (windowSize 3, removeClippedSubviews
 * false), that is three hardware decoders alive to show one video. On the
 * low-RAM Android that most of Echo's audience carries, concurrent decoders are
 * the thing that turns a 60fps feed into a stuttering one.
 *
 * The grace period is the part that is easy to get wrong. Tearing a player down
 * the instant a card stops being active means a fast scroll constructs and
 * destroys a player per card it passes, and that churn costs more than the idle
 * decoders it saves. Holding the player briefly after it goes inactive also
 * makes scrolling back instant, which is the common correction gesture in a
 * paged feed.
 *
 * Tier-aware because the trade-off inverts: a high-tier device can afford to
 * keep a warm player around for a smoother scroll-back, a low-tier device
 * cannot afford the decoder at all and should release as soon as the churn
 * guard allows.
 */

/** How long a player survives after its card stops being active. */
const GRACE_MS: Record<'high' | 'mid' | 'low', number> = {
  // Enough to cover a scroll-back without keeping a decoder alive for long.
  high: 1500,
  mid: 700,
  // Not zero: a fast flick through ten cards would otherwise build and tear
  // down ten players. Short enough that only the card just left holds one.
  low: 250,
};

export function useVideoMountPolicy(isActive: boolean): boolean {
  const [mounted, setMounted] = useState(isActive);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive) {
      // Becoming active is never delayed — the user is looking at this card now.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(true);
      return;
    }

    // Going inactive is delayed, so passing over a card does not construct a
    // player for it and immediately destroy it again.
    let tier: 'high' | 'mid' | 'low' = 'mid';
    try { tier = getDeviceTier(); } catch { /* unknown device stays on mid */ }

    timer.current = setTimeout(() => {
      setMounted(false);
      timer.current = null;
    }, GRACE_MS[tier]);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [isActive]);

  return mounted;
}
