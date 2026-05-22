/**
 * Product analytics facade.
 *
 * For v1 launch we ship a no-op stub with a typed event vocabulary so call
 * sites are correct. Before submitting to the App Store, install your
 * preferred SDK and wire it up here:
 *
 *   PostHog:  npx expo install posthog-react-native
 *   Amplitude: npx expo install @amplitude/analytics-react-native
 *
 * Then replace the `track` body with the SDK call. The event vocabulary
 * below is the canonical list — adding a new event means adding it to the
 * union so we don't ship typos.
 */

export type AnalyticsEvent =
  // ── Lifecycle ──
  | 'app_open'
  | 'app_background'
  // ── Auth funnel ──
  | 'signup_started'
  | 'signup_completed'
  | 'signin_completed'
  | 'signout'
  | 'account_deleted'
  // ── Activation ──
  | 'first_echo_published'
  | 'echo_published'
  | 'echo_drafted'
  // ── Engagement ──
  | 'feed_scope_changed'
  | 'echo_liked'
  | 'echo_reacted'
  | 'echo_bookmarked'
  | 'echo_reposted'
  | 'echo_commented'
  | 'echo_shared'
  | 'echo_thread_opened'
  | 'user_followed'
  | 'search_executed'
  // ── AI ──
  | 'chat_message_sent'
  | 'chat_tool_executed'
  | 'chat_tool_rejected'
  // ── Notifications ──
  | 'push_permission_granted'
  | 'push_permission_denied'
  | 'notification_tapped';

export interface AnalyticsProps {
  [key: string]: string | number | boolean | undefined | null;
}

const ENABLED = false;

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!ENABLED) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics]', event, props ?? '');
    }
    return;
  }
  // SDK integration goes here.
}

/** Set the user id and any traits for subsequent events. */
export function identify(userId: string, traits?: AnalyticsProps): void {
  if (!ENABLED) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics] identify', userId, traits ?? '');
    }
    return;
  }
}

/** Drop the identity on sign-out. */
export function resetIdentity(): void {
  if (!ENABLED) return;
}
