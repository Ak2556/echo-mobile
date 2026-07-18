import { create } from 'zustand';
import { persistGet, persistSet } from './persist';

/**
 * Floating mini-app layer — lets any mini-app ride along over the rest of the
 * app (a "chat head" bubble you can drag anywhere, tap to expand into a panel,
 * and minimize back to keep using the app underneath).
 *
 * Standalone store (not the big useAppStore slice) so it stays self-contained
 * and conflict-free while the mini-app platform is being reworked elsewhere.
 */

export type FloatingMode = 'closed' | 'bubble' | 'panel';

const POS_KEY = 'floatingApp:pos';
const LAST_KEY = 'floatingApp:lastAppId';

interface FloatingAppStore {
  mode: FloatingMode;
  /** The mini-app id currently loaded (null = show the picker). */
  appId: string | null;
  /** Bubble anchor position (persisted). */
  x: number;
  y: number;

  /** Open the panel on a specific app. */
  openApp: (id: string) => void;
  /** Open the panel with the picker (no app selected). */
  openPicker: () => void;
  /** Collapse the panel to the draggable bubble (app stays "loaded"). */
  minimize: () => void;
  /** Bring the resting bubble back after it was dismissed. */
  showBubble: () => void;
  /** Dismiss everything. */
  close: () => void;
  /** Persist a new bubble position. */
  setPosition: (x: number, y: number) => void;
}

const savedPos = persistGet<{ x: number; y: number }>(POS_KEY, { x: -1, y: -1 });

export const useFloatingApp = create<FloatingAppStore>((set) => ({
  mode: 'bubble',
  appId: persistGet<string | null>(LAST_KEY, null),
  x: savedPos.x,
  y: savedPos.y,

  openApp: (id) => { persistSet(LAST_KEY, id); set({ appId: id, mode: 'panel' }); },
  openPicker: () => set({ appId: null, mode: 'panel' }),
  minimize: () => set({ mode: 'bubble' }),
  showBubble: () => set({ mode: 'bubble' }),
  close: () => set({ mode: 'closed' }),
  setPosition: (x, y) => { persistSet(POS_KEY, { x, y }); set({ x, y }); },
}));
