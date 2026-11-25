import { router, type Href } from 'expo-router';

const TAB_PATH = /^(?:\/\(tabs\))?\/(?:home|explore|chat|apps|notifications|watch|you)(?:[/?#]|$)/;

/** Whether an href lands on one of the bottom tabs. */
export function isTabHref(href: Href): boolean {
  const path = typeof href === 'string' ? href : (href as { pathname?: unknown }).pathname;
  return typeof path === 'string' && TAB_PATH.test(path);
}

/**
 * Open a screen from anywhere. A tab is reached by going back to the tab bar
 * already in the stack (`dismissTo`, which replaces the current screen if no
 * tab bar is there). A push or replace to a tab from a screen outside the tabs
 * stacks a second tab navigator, with its own feed, video and animations still
 * running underneath; repeated, that ran the app out of memory (2026-11-25).
 * Every other screen is pushed as before.
 */
export function openRoute(href: Href): void {
  if (isTabHref(href)) router.dismissTo(href);
  else router.push(href);
}
