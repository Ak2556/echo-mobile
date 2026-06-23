-- Echo: remix lineage, conversation snapshots, and pgvector embeddings.
-- Adds the data foundation for the AI-native pivot:
-- - parent_echo_id / remix_root_id  -> fork another user's conversation, keep lineage
-- - source_conversation_id          -> link back to the author's private chat thread
-- - conversation_snapshot           -> frozen multi-turn history at publish time
-- - embedding (vector(768))         -> Gemini text-embedding-004 vectors for semantic feed
-- - remix_count                     -> denormalized counter, kept in sync by trigger
-- - thoughtfulness_score            -> derived quality signal (set by edge function)

-- Columns (idempotent)
alter table public.public_echoes
  add column if not exists parent_echo_id        uuid references public.public_echoes (id) on delete set null,
  add column if not exists remix_root_id         uuid references public.public_echoes (id) on delete set null,
  add column if not exists source_conversation_id uuid references public.ai_conversations (id) on delete set null,
  add column if not exists conversation_snapshot jsonb,
  add column if not exists embedding             vector(768),
  add column if not exists remix_count           int not null default 0,
  add column if not exists thoughtfulness_score  float not null default 0;

-- Indexes
create index if not exists public_echoes_parent_idx
  on public.public_echoes (parent_echo_id)
  where parent_echo_id is not null;

create index if not exists public_echoes_remix_root_idx
  on public.public_echoes (remix_root_id)
  where remix_root_id is not null;

-- HNSW for fast cosine-distance lookups. Only echoes with embeddings are indexed.
create index if not exists public_echoes_embedding_hnsw_idx
  on public.public_echoes
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists public_echoes_thoughtfulness_idx
  on public.public_echoes (thoughtfulness_score desc, created_at desc);

-- Remix lineage trigger
-- On insert of a remix, derive remix_root_id from the parent and bump the
-- parent's remix_count. This keeps clients from having to compute lineage.
create or replace function public.handle_remix_lineage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_root uuid;
begin
  if new.parent_echo_id is not null and new.remix_root_id is null then
    select coalesce(remix_root_id, id) into parent_root
      from public.public_echoes
      where id = new.parent_echo_id;
    new.remix_root_id := parent_root;
  end if;
  return new;
end;
$$;

drop trigger if exists set_remix_lineage on public.public_echoes;
create trigger set_remix_lineage
  before insert on public.public_echoes
  for each row execute function public.handle_remix_lineage();

create or replace function public.adjust_echo_remix_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.parent_echo_id is not null then
    update public.public_echoes
      set remix_count = remix_count + 1
      where id = new.parent_echo_id;
  elsif tg_op = 'DELETE' and old.parent_echo_id is not null then
    update public.public_echoes
      set remix_count = greatest(0, remix_count - 1)
      where id = old.parent_echo_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_remix_change on public.public_echoes;
create trigger on_remix_change
  after insert or delete on public.public_echoes
  for each row execute function public.adjust_echo_remix_count();
