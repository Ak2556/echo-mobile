import { create } from 'zustand';

interface AppState {
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (value: boolean) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  hasSeenOnboarding: false,
  setHasSeenOnboarding: (value) => set({ hasSeenOnboarding: value }),
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));
