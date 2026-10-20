import { create } from 'zustand';

interface ActiveVideoState {
  activeEchoId: string | null;
  setActiveEchoId: (id: string | null) => void;
  /**
   * Cards next to the active one that should already hold a loaded, paused player so that
   * reaching them is instant (lib/feed/videoWarm.ts). Reverb sets it; elsewhere it stays empty.
   */
  warmEchoIds: string[];
  setWarmEchoIds: (ids: string[]) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  activeEchoId: null,
  setActiveEchoId: (id) => set({ activeEchoId: id }),
  warmEchoIds: [],
  setWarmEchoIds: (ids) => set(state => (
    state.warmEchoIds.length === ids.length && state.warmEchoIds.every((id, i) => id === ids[i])
      ? state
      : { warmEchoIds: ids }
  )),
}));
