// Registry of contextual voice actions the active screen can perform — acting on
// the post in view, scrolling, refreshing. Screens register handlers while
// focused; the voice dispatcher invokes them. Decoupled on purpose: the
// dispatcher never imports a screen, and screens never import the dispatcher.

export type PostAction = 'like' | 'bookmark' | 'repost' | 'follow' | 'open';

export interface VoiceActionHandlers {
  /** Act on the post currently in view. Returns true if it acted. */
  postAction?: (action: PostAction) => boolean;
  /**
   * Put spoken text into this screen's composer. Returns true if it landed.
   *
   * Deliberately fills the field rather than sending. create_post already
   * settled this: a mis-transcription must not be able to publish, or reply to
   * someone, on its own. The user sees the words and presses send.
   */
  composeText?: (text: string) => boolean;
  scroll?: (dir: 'up' | 'down') => void;
  refresh?: () => void;
}

/**
 * Handlers are owned by a screen and only live while that screen is focused.
 *
 * This used to be a single mutable object that `registerVoiceActions` merged
 * into, with screens registering in `useEffect(..., [])` — on mount. Tab
 * screens do not unmount when you leave them, so home's handlers stayed live
 * the whole time you were on Explore: "like this" acted on the home feed's
 * current post, silently, while you were looking at something else. A second
 * screen registering would not have replaced them either, it would have merged
 * with them, and whichever key each screen happened to set would win.
 *
 * Keyed by owner instead, with the focused owner the only one the dispatcher
 * can see. Registration is per-screen and revoked on blur, so "the post in
 * view" means the view you are actually looking at.
 */
const registry = new Map<string, VoiceActionHandlers>();
let focusedOwner: string | null = null;

/** Register for `owner` and make it the active screen. Exported for tests. */
export function registerVoiceActions(owner: string, handlers: VoiceActionHandlers): void {
  registry.set(owner, handlers);
  focusedOwner = owner;
}

/**
 * Drop `owner`. If it was focused, the dispatcher sees nothing rather than
 * falling back to some other screen's handlers — a stale action is worse than
 * no action, because the user cannot see what it acted on.
 */
export function clearVoiceActions(owner?: string): void {
  if (owner === undefined) {
    registry.clear();
    focusedOwner = null;
    return;
  }
  registry.delete(owner);
  if (focusedOwner === owner) focusedOwner = null;
}

export function getVoiceActions(): VoiceActionHandlers {
  return (focusedOwner && registry.get(focusedOwner)) || {};
}
