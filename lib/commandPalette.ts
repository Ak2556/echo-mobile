import { create } from 'zustand';

// Tiny store for the global "ask Echo anything" palette.

interface CommandPaletteStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCommandPalette = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
