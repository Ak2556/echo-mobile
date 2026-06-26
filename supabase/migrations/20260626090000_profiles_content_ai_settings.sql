-- Sync content + AI preferences across all of a user's devices.
-- Display prefs (theme, font size, dark mode) remain per-device intentionally.
alter table public.profiles
  add column if not exists ai_model               text    not null default 'gemini-2.5-flash'
    check (ai_model in ('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite')),
  add column if not exists sensitive_content_filter boolean not null default true,
  add column if not exists content_language        text    not null default 'English',
  add column if not exists stream_responses        boolean not null default true,
  add column if not exists auto_save_chats         boolean not null default true;
