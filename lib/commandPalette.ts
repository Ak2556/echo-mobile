import { create } from 'zustand';

// Tiny store for the global "ask Echo anything" palette. Any screen can call
// useCommandPalette.getState().open() to surface it. iPad ⌘K binding can be
// added later via a hardware keyboard listener that calls open().

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
