import { router, type Href } from 'expo-router';

/**
 * Back navigation that can't dead-end. When a screen is reached as a
 * cold-start entry point — tapped from a push notification, opened via a
 * universal link, or restored as the first route — the navigation stack has
 * no previous entry, and `router.back()` throws the dev-only
 * "GO_BACK was not handled by any navigator" warning while doing nothing.
 *
 * Use this anywhere a header back / close button calls `router.back()` on a
 * screen that push notifications or deep links can open directly (thread,
 * user, messages, appeal, daily-question, …). Falls back to a sensible home
 * so the button always resolves to a real destination.
 */
export function safeBack(fallback: Href = '/(tabs)/home'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
