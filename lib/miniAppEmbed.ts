import { createContext, useContext } from 'react';

/**
 * Signals that a mini-app is being rendered *embedded* (inside the floating
 * mini-app panel) rather than as its own full-screen route. MiniAppShell reads
 * this to drop the chrome the panel already provides — its own glass header +
 * back button, the safe-area top inset, and the full-screen workspace brief —
 * so the app fits the panel cleanly.
 */
export const MiniAppEmbedContext = createContext(false);

export function useMiniAppEmbedded(): boolean {
  return useContext(MiniAppEmbedContext);
}
