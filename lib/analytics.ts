/**
 * Product analytics facade backed by posthog-react-native.
 *
 * Initialisation is lazy and consent-gated: PostHog is only loaded if
 * EXPO_PUBLIC_POSTHOG_KEY is set AND the user has accepted analytics in
 * the consent banner. Until that happens every `track()` is a no-op.
 *
 * The typed event vocabulary below is the canonical list — adding a new
 * event means adding it to the union so we don't ship typos.
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
  // ── Differentiator features (the retention thesis) ──
  // These are the mechanics that set Echo apart from a generic feed. They are
  // instrumented so retention can be sliced by feature exposure: e.g. compare
  // D7/D30 of users who engaged a thinking-partner / fingerprint / daily
  // divergence / remix against those who didn't. That comparison is the
  // evidence that "uniqueness drives retention" — not an assertion.
  | 'daily_question_viewed'
  | 'daily_answer_submitted'
  | 'daily_divergence_viewed'
  | 'thinking_partners_viewed'
  | 'thinking_partner_followed'
  | 'thinking_fingerprint_viewed'
  | 'remix_started'
  // ── AI ──
  | 'chat_message_sent'
  | 'chat_tool_executed'
  | 'chat_tool_rejected'
  | 'chat_rate_limited'
  // ── Notifications ──
  | 'push_permission_granted'
  | 'push_permission_denied'
  | 'notification_tapped'
  // ── Consent ──
  | 'consent_accepted'
  | 'consent_declined';

export interface AnalyticsProps {
  [key: string]: string | number | boolean | undefined | null;
}

// Optional dependency — only resolved when the native module is bundled.
type PostHogModule = { default: new (key: string, options?: Record<string, unknown>) => PostHogInstance } | null;

interface PostHogInstance {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  reset(): void;
}

let client: PostHogInstance | null = null;
let initialised = false;

function loadPostHog(): PostHogModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('posthog-react-native') as PostHogModule;
  } catch {
    return null;
  }
}

/**
 * Initialise PostHog. Must only be called after the user has accepted
 * analytics consent (see components/ConsentBanner). Safe to call multiple
 * times — only the first call performs the underlying init.
 */
export function initAnalytics(): void {
  if (initialised) return;
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
  const mod = loadPostHog();
  if (!mod) return;
  try {
    const PostHogCtor = mod.default;
    client = new PostHogCtor(key, { host, flushAt: 20, flushInterval: 30000 });
    initialised = true;
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] PostHog init failed', e);
    }
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!initialised || !client) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics]', event, props ?? '');
    }
    return;
  }
  client.capture(event, props as Record<string, unknown> | undefined);
}

/** Set the user id and any traits for subsequent events. */
export function identify(userId: string, traits?: AnalyticsProps): void {
  if (!initialised || !client) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics] identify', userId, traits ?? '');
    }
    return;
  }
  client.identify(userId, traits as Record<string, unknown> | undefined);
}

/** Drop the identity on sign-out. */
export function resetIdentity(): void {
  if (!initialised || !client) return;
  client.reset();
}
