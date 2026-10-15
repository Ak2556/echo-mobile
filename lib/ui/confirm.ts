import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** The button that goes ahead, in the words of what it does: "Delete", "Sign out". */
  confirmLabel: string;
  destructive?: boolean;
}

interface Pending { options: ConfirmOptions; resolve: (ok: boolean) => void }

interface ConfirmState {
  pending: Pending | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (options) => new Promise<boolean>((resolve) => {
    // A second question answers the first with "no" rather than leaving it hanging.
    get().pending?.resolve(false);
    set({ pending: { options, resolve } });
  }),
  settle: (ok) => {
    const p = get().pending;
    if (!p) return;
    set({ pending: null });
    p.resolve(ok);
  },
}));

/**
 * A yes/no question in the app's own sheet, in place of the operating system's alert:
 *
 *     if (await confirmAction({ title: 'Delete note?', confirmLabel: 'Delete', destructive: true })) remove();
 *
 * Resolves true on the action and false on Cancel, a tap on the scrim, or the Android back
 * button. The sheet itself is drawn once, by <ConfirmHost /> in the root layout, so a screen
 * needs no state or element to ask.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}
