import { create } from 'zustand';

/**
 * True while the Terms / Privacy agreement gate is on screen.
 *
 * Both gates are modals, and iOS cannot present two at once. An account with no birthday on file and no
 * agreement on record meets both on its first launch of the version that adds this gate, so the agreement
 * goes first and the birthday card waits until it is resolved.
 */
export const useTermsGateStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
