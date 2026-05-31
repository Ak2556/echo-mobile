-- Thinking Fingerprint cache.
--
-- The thinking-fingerprint edge function reads a user's recent moderated echoes
-- (text + 768-d embeddings), derives an embedding "range" metric, and asks an
-- LLM to synthesise a short portrait of how that person thinks (archetype,
-- themes, reasoning style). That synthesis is expensive, so we cache it here and
-- only regenerate when the user's echo_count changes or the row goes stale.
--
-- Clients never read this table directly — they call the edge function, which
-- runs with the service role and bypasses RLS. RLS is therefore enabled with no
-- policies, locking the table to service-role access only.

create table if not exists public.thinking_fingerprints (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  data         jsonb       not null,   -- { archetype, summary, themes[], reasoning_style, signature_question, range }
  echo_count   int         not null,   -- echo count the fingerprint was derived from (cache key)
  generated_at timestamptz not null default now()
);

alter table public.thinking_fingerprints enable row level security;
-- No policies: only the service role (edge function) may read/write.
