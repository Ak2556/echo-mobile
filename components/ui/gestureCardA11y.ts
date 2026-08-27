import type { AccessibilityActionInfo } from 'react-native';

/**
 * Republishing gestures as accessibility actions.
 *
 * A gesture is invisible to a screen reader. If swiping is the only way to like
 * or save something, then for a VoiceOver or TalkBack user that action does not
 * exist — and Echo carries reporting and blocking duties where that is not an
 * acceptable outcome. So every bound gesture is mirrored into the actions rotor,
 * and this is the piece that guarantees it.
 *
 * Kept pure and separate so the guarantee is a unit test rather than an
 * intention: `buildActions` must never drop one, and `dispatch` must reach the
 * right handler.
 */

export interface GestureCardAction {
  /** Stable id; also the accessibilityAction name. */
  id: string;
  /** Spoken in the screen reader's actions rotor. */
  label: string;
  run: () => void;
}

export function buildActions(
  candidates: Array<GestureCardAction | undefined | null>,
): AccessibilityActionInfo[] {
  const out: AccessibilityActionInfo[] = [];
  for (const a of candidates) {
    if (!a) continue;
    // The same action can be bound to two gestures — double-tap and swipe both
    // meaning "like" is normal. The rotor should list it once.
    if (out.some(x => x.name === a.id)) continue;
    out.push({ name: a.id, label: a.label });
  }
  return out;
}

/** Returns true when an action matched and ran. */
export function dispatch(
  name: string,
  candidates: Array<GestureCardAction | undefined | null>,
): boolean {
  for (const a of candidates) {
    if (a && a.id === name) {
      a.run();
      return true;
    }
  }
  return false;
}
