import { create } from 'zustand';
import type { VoicePhase } from '../lib/voice/types';

/**
 * Voice control bridge — lets any surface (e.g. the floating mini-app bubble)
 * start a hands-free session and reflect its live phase, while <VoiceControl/>
 * remains the single owner of the recorder/hook and the status panel.
 *
 * <VoiceControl/> registers its `start` on mount and mirrors the phase; the
 * floating bubble long-press calls `startVoice` and tints itself while
 * listening. Kept as a tiny standalone store so there is exactly one voice
 * session regardless of how many surfaces can trigger it.
 */
interface VoiceControlStore {
  /** Registered by <VoiceControl/>; null until it mounts. */
  startVoice: (() => void) | null;
  register: (fn: (() => void) | null) => void;
  /** Mirrors the live voice phase for ambient UI. */
  phase: VoicePhase;
  setPhase: (phase: VoicePhase) => void;
}

export const useVoiceControl = create<VoiceControlStore>((set) => ({
  startVoice: null,
  register: (fn) => set({ startVoice: fn }),
  phase: 'idle',
  setPhase: (phase) => set({ phase }),
}));
