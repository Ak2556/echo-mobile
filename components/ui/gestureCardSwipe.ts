/**
 * The arithmetic behind a swipeable card, kept away from the component so it can
 * be tested without a touch screen.
 *
 * Two behaviours matter and they are easy to get subtly wrong:
 *
 *   resist   how far the card follows the finger. Following one-to-one forever
 *            makes a card feel detached; stopping dead feels broken. It tracks
 *            exactly up to the commit threshold, so the point where a release
 *            would fire is the point the card stops keeping up, then falls off.
 *
 *   decide   what a release means. Distance alone ignores a fast flick; velocity
 *            alone fires on a stray twitch during a vertical scroll. Both, with
 *            a floor on distance before velocity counts for anything.
 */

export type SwipeOutcome = 'left' | 'right' | 'none';

export interface SwipeConfig {
  /** Travel past which a release commits, in points. */
  threshold: number;
  /** Points per second that commits on its own — a flick. */
  velocity: number;
  /** Hard stop on how far the card can travel. */
  maxTravel: number;
}

export const DEFAULT_SWIPE: SwipeConfig = {
  threshold: 78,
  velocity: 900,
  maxTravel: 132,
};

/**
 * A flick only counts once the card has actually moved a fair way. Without this,
 * the vertical fling that scrolls a feed registers a few pixels of horizontal
 * drift at high speed and fires an action nobody asked for.
 */
const VELOCITY_MIN_TRAVEL = 0.45;

export function resist(dx: number, cfg: SwipeConfig = DEFAULT_SWIPE): number {
  'worklet';
  const sign = dx < 0 ? -1 : 1;
  const distance = Math.abs(dx);
  if (distance <= cfg.threshold) return dx;

  // Past the threshold the surplus is compressed towards an asymptote, so the
  // card keeps responding but never runs away.
  const surplus = distance - cfg.threshold;
  const room = cfg.maxTravel - cfg.threshold;
  const eased = room * (1 - Math.exp(-surplus / room));
  return sign * (cfg.threshold + eased);
}

export function decideSwipe(
  dx: number,
  vx: number,
  cfg: SwipeConfig = DEFAULT_SWIPE,
): SwipeOutcome {
  'worklet';
  const distance = Math.abs(dx);
  const direction: SwipeOutcome = dx < 0 ? 'left' : 'right';

  if (distance >= cfg.threshold) return direction;

  const flicked =
    Math.abs(vx) >= cfg.velocity &&
    distance >= cfg.threshold * VELOCITY_MIN_TRAVEL &&
    // The flick has to agree with where the card already is. A fast reversal is
    // the user putting it back, not committing.
    (vx < 0) === (dx < 0);

  return flicked ? direction : 'none';
}
