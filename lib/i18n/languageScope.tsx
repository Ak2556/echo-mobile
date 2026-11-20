import React, { Fragment } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Remounts its children when the app language changes.
 *
 * ttx('literal') reads the language at call time, and the React Compiler caches
 * that call once per mount: a re-render does not recompute it. A screen that
 * stayed mounted through a language switch kept the old language until the app
 * restarted ("स्मार्ट शुरुआत" on Tools after switching back to English). A new
 * key remounts the subtree, so every ttx() runs again in the new language.
 *
 * Remounting resets local state (scroll, half-typed input), which is acceptable
 * for a switch the user makes once, but not for a navigator (React Navigation
 * clears a nested navigator's state when it unmounts) or for a screen that
 * switches language in place mid-form. Those are kept out with
 * remountOnLanguageChange(keep) and must use useI18n().tt instead.
 */
export function LanguageScope({ children }: { children: React.ReactNode }) {
  const appLanguage = useAppStore(s => s.appLanguage);
  return <Fragment key={appLanguage}>{children}</Fragment>;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * A navigator's `screenLayout`: wraps each screen in LanguageScope, except the
 * routes named in `keep` (nested navigators, and screens that switch language
 * in place while holding input).
 */
export function remountOnLanguageChange(keep: ReadonlySet<string> = NONE) {
  return function LanguageScopedScreen({ route, children }: { route: { name: string }; children: React.ReactElement }) {
    return keep.has(route.name) ? children : <LanguageScope>{children}</LanguageScope>;
  };
}
