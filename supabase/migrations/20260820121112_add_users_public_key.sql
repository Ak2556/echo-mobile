-- Add public_key column for the (unused) E2E encryption keypair.
--
-- ⚠ CORRECTED 2026-08-22. As written, this migration was:
--     ALTER TABLE public.users ADD COLUMN IF NOT EXISTS public_key text;
--
-- `public.users` does not exist and never has — no migration creates it; the
-- table is `public.profiles`. The IF NOT EXISTS guard covers the column, not
-- the table, so this statement raises "relation public.users does not exist"
-- on any database where the migrations are replayed from scratch.
--
-- It is recorded as applied against production, but production has no
-- public.users table (verified: PostgREST returns PGRST205 for it), so the
-- statement cannot have succeeded there either. The practical effect was that
-- Echo could not be rebuilt from its own migration history — every fresh
-- environment, including Supabase branch previews, failed here.
--
-- Rewritten as a guarded no-op. This changes nothing on production and lets a
-- fresh database replay the full history.
--
-- The feature this supported is not wired up either: see the banner in
-- src/shared/lib/e2ee.ts. If end-to-end encryption is ever built for real,
-- add the column to `public.profiles` in a new migration rather than reviving
-- this one.

do $$
begin
  if to_regclass('public.users') is not null then
    alter table public.users add column if not exists public_key text;
  else
    raise notice
      'skipping: public.users does not exist. E2EE key storage is not wired up; '
      'see src/shared/lib/e2ee.ts.';
  end if;
end $$;
