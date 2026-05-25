/**
 * Data retention policy for Echo.
 *
 * This file is the canonical reference for what Echo stores, where it
 * lives, and how long it sticks around. Reference this object from the
 * Privacy Policy (docs/privacy-policy.md) so the two never drift.
 *
 * Anything not listed here is NOT stored server-side.
 */

export interface RetentionEntry {
  /** Human-readable name shown in the privacy policy. */
  category: string;
  /** Where the bytes live. */
  storage: 'supabase_postgres' | 'supabase_storage' | 'device_mmkv' | 'sentry' | 'posthog';
  /** What we keep. */
  what: string;
  /** When the row goes away. */
  retention: string;
}

export const DATA_RETENTION_POLICY: readonly RetentionEntry[] = [
  {
    category: 'Account & profile',
    storage: 'supabase_postgres',
    what: 'auth.users row, profiles row (username, display name, bio, avatar color/URL)',
    retention: 'Until the user requests deletion (Settings → Delete account). Cascades to all owned content immediately.',
  },
  {
    category: 'Public posts (“echoes”) and comments',
    storage: 'supabase_postgres',
    what: 'public_echoes, echo_comments — only content the user explicitly published',
    retention: 'Until the user deletes the row, or their account is deleted.',
  },
  {
    category: 'AI chat history',
    storage: 'supabase_postgres',
    what: 'ai_conversations, ai_messages, ai_tool_calls keyed by user_id',
    retention: 'Until the user deletes the conversation, or their account is deleted.',
  },
  {
    category: 'AI rate-limit window',
    storage: 'supabase_postgres',
    what: 'ai_rate_limits — one row per user, tracking the current hour\'s request count',
    retention: 'Updated continuously; deleted when the account is deleted.',
  },
  {
    category: 'Follows, reactions, bookmarks, mutes, blocks',
    storage: 'supabase_postgres',
    what: 'follows, echo_likes, echo_reactions, echo_bookmarks, user_mutes, user_blocks',
    retention: 'Until the user reverses the action, or their account is deleted.',
  },
  {
    category: 'Direct messages',
    storage: 'supabase_postgres',
    what: 'dm_conversations, dm_messages — both participants own the row',
    retention: 'Until both participants delete their account.',
  },
  {
    category: 'Push tokens',
    storage: 'supabase_postgres',
    what: 'push_tokens — Expo push token + platform',
    retention: 'Until the user disables push or deletes their account.',
  },
  {
    category: 'Uploaded media',
    storage: 'supabase_storage',
    what: 'echo-media bucket and avatars bucket objects',
    retention: 'Until the owning row is deleted, then the cascade trigger purges the object.',
  },
  {
    category: 'Local preferences',
    storage: 'device_mmkv',
    what: 'Theme, accent color, font size, onboarding state, analytics consent choice',
    retention: 'Lives on the device only. Cleared when the user uninstalls the app or signs out (most keys).',
  },
  {
    category: 'Crash reports',
    storage: 'sentry',
    what: 'Stack traces, device model, OS version, breadcrumbs (no PII fields)',
    retention: 'Sentry default — 90 days, then auto-purged.',
  },
  {
    category: 'Product analytics',
    storage: 'posthog',
    what: 'Typed AnalyticsEvent names + props (see lib/analytics.ts). Sent only after explicit user consent.',
    retention: 'PostHog default — 7 years aggregate, but per-user history can be deleted via PostHog GDPR tooling within 30 days of an account deletion request.',
  },
] as const;

/** ISO date when this policy was last updated. Bump on any material change. */
export const DATA_RETENTION_POLICY_LAST_UPDATED = '2026-05-23';
