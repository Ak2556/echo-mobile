-- Persist post type on echoes.
--
-- Until now the client INFERRED post type from media presence
-- (video → 'video', media → 'photo', else → 'text'). That's fine for those
-- three, but "musing" (a text-only "thinking out loud" post) is
-- indistinguishable from a plain text echo on the wire — it would round-trip
-- back as 'text' and lose its treatment.
--
-- Add an explicit post_type column. Default 'text' so every existing row
-- keeps its current behavior. No CHECK constraint — keeping it open lets us
-- add future types without a migration.

alter table public.public_echoes
  add column if not exists post_type text not null default 'text';
