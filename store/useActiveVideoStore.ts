import { create } from 'zustand';

interface ActiveVideoState {
  activeEchoId: string | null;
  setActiveEchoId: (id: string | null) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  activeEchoId: null,
  setActiveEchoId: (id) => set({ activeEchoId: id }),
}));
