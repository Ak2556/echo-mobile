/**
 * A permission asked once, at the moment it is first needed, and answered by a
 * sheet mounted at the app root.
 *
 * `ensure()` resolves true or false with the user's answer; concurrent callers
 * share one sheet. The choice is stored with its timestamp as the record of
 * consent. `rememberRefusal` decides whether "no" is final until changed in
 * Settings, or whether the next use asks again.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persistGet, persistSet } from '../store/persist';

export type ConsentAnswer = 'granted' | 'declined' | 'undecided';

interface Stored {
  answer: ConsentAnswer;
  at: string;
}

export interface ConsentState {
  answer: ConsentAnswer;
  /** Set while the sheet is open; resolves the pending ensure(). */
  pending: ((granted: boolean) => void) | null;
  set: (answer: ConsentAnswer) => void;
}

export interface ConsentGate {
  useConsent: UseBoundStore<StoreApi<ConsentState>>;
  ensure: () => Promise<boolean>;
  answer: (granted: boolean) => void;
}

export function createConsentGate(storageKey: string, opts: { rememberRefusal: boolean }): ConsentGate {
  const read = (): ConsentAnswer => {
    try {
      return persistGet<Stored | null>(storageKey, null)?.answer ?? 'undecided';
    } catch {
      return 'undecided';
    }
  };

  const useConsent = create<ConsentState>((setState) => ({
    answer: read(),
    pending: null,
    set: (answer) => {
      try {
        persistSet<Stored>(storageKey, { answer, at: new Date().toISOString() });
      } catch { /* storage unavailable: the choice holds for this session */ }
      setState({ answer });
    },
  }));

  const ensure = (): Promise<boolean> => {
    const { answer } = useConsent.getState();
    if (answer === 'granted') return Promise.resolve(true);
    if (answer === 'declined' && opts.rememberRefusal) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const previous = useConsent.getState().pending;
      useConsent.setState({
        pending: (granted: boolean) => {
          previous?.(granted);
          resolve(granted);
        },
      });
    });
  };

  const answer = (granted: boolean): void => {
    const { pending, set } = useConsent.getState();
    if (granted) set('granted');
    else if (opts.rememberRefusal) set('declined');
    useConsent.setState({ pending: null });
    pending?.(granted);
  };

  return { useConsent, ensure, answer };
}
