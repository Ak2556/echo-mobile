// Registry of contextual voice actions the active screen can perform — acting on
// the post in view, scrolling, refreshing. Screens register handlers while
// focused; the voice dispatcher invokes them. Decoupled on purpose: the
// dispatcher never imports a screen, and screens never import the dispatcher.

export type PostAction = 'like' | 'bookmark' | 'repost' | 'follow' | 'open';

export interface VoiceActionHandlers {
  /** Act on the post currently in view. Returns true if it acted. */
  postAction?: (action: PostAction) => boolean;
  scroll?: (dir: 'up' | 'down') => void;
  refresh?: () => void;
}

let handlers: VoiceActionHandlers = {};

export function registerVoiceActions(h: Partial<VoiceActionHandlers>) {
  handlers = { ...handlers, ...h };
}
export function clearVoiceActions() {
  handlers = {};
}
export function getVoiceActions(): VoiceActionHandlers {
  return handlers;
}
