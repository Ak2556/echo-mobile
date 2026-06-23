export type AnalyticsEvent =
  | 'app_open'
  | 'app_background'
  | 'signup_started'
  | 'signup_completed'
  | 'signin_completed'
  | 'signout'
  | 'account_deleted'
  | 'first_echo_published'
  | 'echo_published'
  | 'echo_drafted'
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
  | 'daily_question_viewed'
  | 'daily_answer_submitted'
  | 'daily_divergence_viewed'
  | 'thinking_partners_viewed'
  | 'thinking_partner_followed'
  | 'thinking_fingerprint_viewed'
  | 'marketplace_viewed'
  | 'marketplace_listing_opened'
  | 'marketplace_inquiry_started'
  | 'remix_started'
  | 'perspective_started'
  | 'perspective_type_selected'
  | 'perspective_published'
  | 'evolution_opened'
  | 'evolution_shared'
  | 'evolving_rail_opened'
  | 'chat_message_sent'
  | 'chat_tool_executed'
  | 'chat_tool_rejected'
  | 'chat_rate_limited'
  | 'product_onboarding_started'
  | 'product_onboarding_skipped'
  | 'product_onboarding_chat_sent'
  | 'product_onboarding_draft_created'
  | 'product_onboarding_completed'
  | 'persona_learning_started'
  | 'persona_learning_disabled'
  | 'persona_snapshot_reset'
  | 'persona_note_updated'
  | 'push_permission_granted'
  | 'push_permission_denied'
  | 'notification_tapped'
  | 'consent_accepted'
  | 'consent_declined';

export interface AnalyticsProps {
  [key: string]: string | number | boolean | undefined | null;
}

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
    void event;
    void props;
    return;
  }
  client.capture(event, props as Record<string, unknown> | undefined);
}

export function identify(userId: string, traits?: AnalyticsProps): void {
  if (!initialised || !client) {
    void userId;
    void traits;
    return;
  }
  client.identify(userId, traits as Record<string, unknown> | undefined);
}

export function resetIdentity(): void {
  if (!initialised || !client) return;
  client.reset();
}
