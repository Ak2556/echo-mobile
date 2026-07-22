import { create } from 'zustand';

/** A measured on-screen rect (window coordinates) for a tutorial target. */
export type TutorialRect = { x: number; y: number; width: number; height: number };

/**
 * Transient state for the interactive coach-mark tour. Kept OUT of the
 * persisted app store on purpose — only `hasSeenHomeTutorial` (in settingsSlice)
 * persists; the active tour, current step, and measured target rects are
 * ephemeral UI state.
 */
interface TutorialStore {
  activeTour: string | null;
  stepIndex: number;
  targets: Record<string, TutorialRect>;
  startTour: (tour: string) => void;
  nextStep: () => void;
  endTour: () => void;
  registerTarget: (id: string, rect: TutorialRect) => void;
  unregisterTarget: (id: string) => void;
}

export const useTutorialStore = create<TutorialStore>((set) => ({
  activeTour: null,
  stepIndex: 0,
  targets: {},
  startTour: (tour) => set({ activeTour: tour, stepIndex: 0 }),
  nextStep: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
  endTour: () => set({ activeTour: null, stepIndex: 0 }),
  registerTarget: (id, rect) => set((s) => ({ targets: { ...s.targets, [id]: rect } })),
  unregisterTarget: (id) => set((s) => {
    if (!(id in s.targets)) return s;
    const next = { ...s.targets };
    delete next[id];
    return { targets: next };
  }),
}));
