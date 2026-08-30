# Personal Feed Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the For You tab's `get_semantic_feed` with a two-stage personalized ranker that never goes empty, never repeats, and stays index-bound at 10M rows.

**Architecture:** A single Postgres RPC `get_personal_feed` does eligibility → candidate generation (~300 rows from four indexed sources) → scoring over those candidates → constrained selection enforcing per-author diversity and an exploration reserve. Per-user taste vectors live in a `user_taste` table refreshed lazily on read, which is what makes the existing HNSW index usable.

**Tech Stack:** Postgres 17 + pgvector (HNSW, `extensions` schema), Supabase RPC, TypeScript client via `supabase.rpc`, vitest for pure-function tests.

**Spec:** `docs/superpowers/specs/2026-08-30-personal-feed-ranking-design.md`

## Global Constraints

- pgvector lives in the `extensions` schema. **Every** function touching a vector type or the `<=>` operator MUST declare `set search_path = public, extensions`. A bare `public` search_path silently breaks with `42704 type "vector" does not exist` — this exact bug killed four RPCs for 19 days (see migration `20260830044247`).
- Embedding dimension is **768** (`extensions.vector(768)`).
- Every reader of `public_echoes` MUST filter `check_content = true`. RLS does not enforce this (the SELECT policy is `qual: true`) and `SECURITY DEFINER` bypasses RLS anyway.
- New tables get `enable row level security` plus an explicit owner-only policy. A table with RLS on and no policy denies everything.
- Migrations are applied with `supabase db push --linked`. Docker is not running, so there is no local stack — verification runs against the linked project.
- Commit messages carry **no** Claude/AI attribution, no `Co-Authored-By`, no `Claude-Session` trailer.
- `floor` constant for `base` is `0.01`.
- Affinity weights: semantic `0.6`, following `0.5`, author affinity `0.4` (saturating at 5 interactions).
- Per-author cap: **2** per page. Exploration reserve: **20%** of `p_limit`. Taste staleness threshold: **6 hours**. Seen-window: **90 days**.

---

### Task 1: Schema — taste, negative signals, seen index

**Files:**
- Create: `supabase/migrations/<timestamp>_personal_feed_schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `public.user_taste(user_id uuid pk, taste_vector extensions.vector(768), top_authors uuid[], updated_at timestamptz)`, `public.user_not_interested(user_id uuid, echo_id uuid null, author_id uuid null, created_at timestamptz)`, index `echo_views_user_created_idx`

- [ ] **Step 1: Write the migration**

Create the file with a timestamp from `date -u +%Y%m%d%H%M%S`:

```sql
-- Per-user state for the personalized For You ranker.
-- user_taste caches the taste vector so the HNSW index is usable: an ANN search
-- needs a constant vector, which a per-request avg(embedding) CTE is not.

create table if not exists public.user_taste (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  taste_vector extensions.vector(768),
  top_authors  uuid[] not null default '{}',
  updated_at   timestamptz not null default now()
);

alter table public.user_taste enable row level security;

drop policy if exists "user_taste read own" on public.user_taste;
create policy "user_taste read own"
  on public.user_taste for select
  using (auth.uid() = user_id);

-- Negative signal. Exactly one target per row: an echo, or a whole author.
create table if not exists public.user_not_interested (
  user_id    uuid not null references auth.users (id) on delete cascade,
  echo_id    uuid references public.public_echoes (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_not_interested_target_chk check (num_nonnulls(echo_id, author_id) = 1)
);

create unique index if not exists user_not_interested_echo_uidx
  on public.user_not_interested (user_id, echo_id) where echo_id is not null;
create unique index if not exists user_not_interested_author_uidx
  on public.user_not_interested (user_id, author_id) where author_id is not null;

alter table public.user_not_interested enable row level security;

drop policy if exists "user_not_interested rw own" on public.user_not_interested;
create policy "user_not_interested rw own"
  on public.user_not_interested for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seen-state anti-join support. echo_views has (user_id) and (echo_id, user_id)
-- but nothing that makes "this user's views in the last 90 days" cheap.
create index if not exists echo_views_user_created_idx
  on public.echo_views (user_id, created_at desc);
```

- [ ] **Step 2: Apply it**

Run: `supabase db push --linked`
Expected: `Applying migration <timestamp>_personal_feed_schema.sql...` then `Finished supabase db push.`

- [ ] **Step 3: Verify the objects exist and the CHECK bites**

Run this SQL against the linked project:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name in ('user_taste','user_not_interested')) as tables_created,
  (select count(*) from pg_indexes
    where schemaname='public' and indexname='echo_views_user_created_idx') as seen_index,
  (select count(*) from pg_policies
    where schemaname='public' and tablename in ('user_taste','user_not_interested')) as policies;
```

Expected: `tables_created = 2`, `seen_index = 1`, `policies = 2`.

Then confirm the CHECK rejects a two-target row:

```sql
insert into public.user_not_interested (user_id, echo_id, author_id)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');
```

Expected: FAILS with `violates check constraint "user_not_interested_target_chk"`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(feed): schema for personalized ranking — taste, negative signals, seen index"
```

---

### Task 2: `refresh_user_taste` — the cached taste vector

**Files:**
- Create: `supabase/migrations/<timestamp>_refresh_user_taste.sql`

**Interfaces:**
- Consumes: `public.user_taste` (Task 1)
- Produces: `public.refresh_user_taste(p_user_id uuid) returns void`

- [ ] **Step 1: Write the migration**

```sql
-- Recomputes one user's taste vector from their 20 most recent likes.
-- SECURITY DEFINER because it writes user_taste, whose RLS policy is read-only
-- to the owner. search_path MUST include extensions or vector(768) fails to
-- resolve (42704).
create or replace function public.refresh_user_taste(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_taste   extensions.vector(768);
  v_authors uuid[];
begin
  select avg(src.embedding)::extensions.vector(768)
    into v_taste
    from (
      select e.embedding
        from public.echo_likes l
        join public.public_echoes e on e.id = l.echo_id
       where l.user_id = p_user_id
         and e.embedding is not null
         and e.check_content = true
       order by l.created_at desc
       limit 20
    ) src;

  select array_agg(t.author_id order by t.c desc)
    into v_authors
    from (
      select e.author_id, count(*) as c
        from public.echo_likes l
        join public.public_echoes e on e.id = l.echo_id
       where l.user_id = p_user_id
       group by e.author_id
       order by c desc
       limit 10
    ) t;

  insert into public.user_taste (user_id, taste_vector, top_authors, updated_at)
  values (p_user_id, v_taste, coalesce(v_authors, '{}'), now())
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        top_authors  = excluded.top_authors,
        updated_at   = now();
end;
$$;

revoke all on function public.refresh_user_taste(uuid) from public, anon;
grant execute on function public.refresh_user_taste(uuid) to authenticated, service_role;
```

- [ ] **Step 2: Apply it**

Run: `supabase db push --linked`
Expected: migration applies cleanly.

- [ ] **Step 3: Verify against a real user who has likes**

```sql
with u as (
  select user_id from public.echo_likes group by user_id order by count(*) desc limit 1
)
select public.refresh_user_taste((select user_id from u));

select user_id,
       taste_vector is not null as has_vector,
       array_length(top_authors, 1) as author_count,
       updated_at
  from public.user_taste;
```

Expected: one row, `has_vector = true`, `author_count >= 1`.

A user with zero likes must still upsert a row with a NULL vector rather than error — verify:

```sql
select public.refresh_user_taste('00000000-0000-0000-0000-000000000009');
select taste_vector is null as null_vector from public.user_taste
 where user_id = '00000000-0000-0000-0000-000000000009';
```

Expected: `null_vector = true`, no exception.

- [ ] **Step 4: Clean up the synthetic row**

```sql
delete from public.user_taste where user_id = '00000000-0000-0000-0000-000000000009';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(feed): refresh_user_taste computes and caches per-user taste vectors"
```

---

### Task 3: Pure-TS selection constraints

Selection rules are the part most likely to regress silently, and they are testable without a database. Implement them in TypeScript first so the SQL in Task 5 has a reference implementation with tests.

**Files:**
- Create: `lib/feedSelection.ts`
- Test: `lib/feedSelection.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `applyDiversity<T extends SelectableItem>(items: T[], opts: { limit: number; perAuthorCap: number; explorationShare: number }): T[]`, and `export interface SelectableItem { id: string; authorId: string; score: number; source: 'follow' | 'semantic' | 'trending' | 'exploration' }`

- [ ] **Step 1: Write the failing test**

Create `lib/feedSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyDiversity, type SelectableItem } from './feedSelection';

const item = (
  id: string,
  authorId: string,
  score: number,
  source: SelectableItem['source'] = 'trending',
): SelectableItem => ({ id, authorId, score, source });

describe('applyDiversity', () => {
  it('caps how many echoes one author can take in a page', () => {
    const items = [
      item('a1', 'author-1', 100),
      item('a2', 'author-1', 90),
      item('a3', 'author-1', 80),
      item('b1', 'author-2', 70),
    ];
    const out = applyDiversity(items, { limit: 4, perAuthorCap: 2, explorationShare: 0 });
    expect(out.filter(i => i.authorId === 'author-1')).toHaveLength(2);
    expect(out.map(i => i.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('keeps the highest scoring items first', () => {
    const items = [item('low', 'a', 1), item('high', 'b', 99)];
    const out = applyDiversity(items, { limit: 2, perAuthorCap: 2, explorationShare: 0 });
    expect(out[0].id).toBe('high');
  });

  it('reserves a share of slots for exploration even when it scores low', () => {
    const items = [
      item('t1', 'a', 100), item('t2', 'b', 99), item('t3', 'c', 98),
      item('t4', 'd', 97), item('e1', 'e', 1, 'exploration'),
    ];
    const out = applyDiversity(items, { limit: 5, perAuthorCap: 2, explorationShare: 0.2 });
    expect(out.some(i => i.source === 'exploration')).toBe(true);
  });

  it('does not pad with exploration items that do not exist', () => {
    const items = [item('t1', 'a', 100), item('t2', 'b', 99)];
    const out = applyDiversity(items, { limit: 5, perAuthorCap: 2, explorationShare: 0.2 });
    expect(out).toHaveLength(2);
  });

  it('never returns more than the limit', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`i${i}`, `author-${i}`, 100 - i));
    expect(applyDiversity(items, { limit: 20, perAuthorCap: 2, explorationShare: 0.2 })).toHaveLength(20);
  });

  it('returns an empty array for no input', () => {
    expect(applyDiversity([], { limit: 20, perAuthorCap: 2, explorationShare: 0.2 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/feedSelection.test.ts`
Expected: FAIL — cannot resolve `./feedSelection`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/feedSelection.ts`:

```ts
/**
 * Constrained selection for the personalized feed.
 *
 * Diversity is enforced here rather than hoped for: without a per-author cap a
 * single prolific author can own the whole page, and without an exploration
 * reserve the ranker only ever shows what it already believes, which is how a
 * feed stops surprising anyone and quietly stops being worth opening.
 */

export interface SelectableItem {
  id: string;
  authorId: string;
  score: number;
  source: 'follow' | 'semantic' | 'trending' | 'exploration';
}

export interface DiversityOptions {
  limit: number;
  perAuthorCap: number;
  /** Fraction of the page reserved for exploration items, 0..1. */
  explorationShare: number;
}

export function applyDiversity<T extends SelectableItem>(
  items: T[],
  opts: DiversityOptions,
): T[] {
  const { limit, perAuthorCap, explorationShare } = opts;
  if (limit <= 0 || items.length === 0) return [];

  const byScore = [...items].sort((a, b) => b.score - a.score);
  const exploreSlots = Math.floor(limit * explorationShare);
  const mainSlots = limit - exploreSlots;

  const perAuthor = new Map<string, number>();
  const chosen: T[] = [];
  const taken = new Set<string>();

  const tryTake = (item: T): boolean => {
    if (taken.has(item.id)) return false;
    const used = perAuthor.get(item.authorId) ?? 0;
    if (used >= perAuthorCap) return false;
    perAuthor.set(item.authorId, used + 1);
    taken.add(item.id);
    chosen.push(item);
    return true;
  };

  // Main slots: best scoring items that respect the author cap.
  for (const item of byScore) {
    if (chosen.length >= mainSlots) break;
    tryTake(item);
  }

  // Reserved slots: exploration first, then anything left over so a page is
  // never short purely because there was nothing to explore.
  for (const item of byScore.filter(i => i.source === 'exploration')) {
    if (chosen.length >= limit) break;
    tryTake(item);
  }
  for (const item of byScore) {
    if (chosen.length >= limit) break;
    tryTake(item);
  }

  return chosen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/feedSelection.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/feedSelection.ts lib/feedSelection.test.ts
git commit -m "feat(feed): per-author cap and exploration reserve for feed selection"
```

---

### Task 4: `get_personal_feed` — eligibility, candidates, scoring

**Files:**
- Create: `supabase/migrations/<timestamp>_get_personal_feed.sql`

**Interfaces:**
- Consumes: `public.user_taste`, `public.user_not_interested` (Task 1), `public.refresh_user_taste` (Task 2)
- Produces: `public.get_personal_feed(p_user_id uuid, p_limit int, p_cursor_score float8, p_cursor_id uuid, p_session_seed int)` returning the same column set as `get_ranked_feed` plus `source text`

- [ ] **Step 1: Write the migration**

```sql
create or replace function public.get_personal_feed(
  p_user_id      uuid,
  p_limit        int     default 20,
  p_cursor_score float8  default null,
  p_cursor_id    uuid    default null,
  p_session_seed int     default 0
)
returns table(
  id uuid, author_id uuid, title text, prompt text, response text,
  likes_count integer, comment_count integer, repost_count integer, view_count integer,
  created_at timestamptz, media_urls text[], quoted_echo_id uuid,
  username text, display_name text, bio text, avatar_color text, avatar_url text,
  is_verified boolean, follower_count integer,
  rank_score double precision, source text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_taste   extensions.vector(768);
  v_updated timestamptz;
begin
  -- Stage 0: eligibility. A user who cannot be profiled never reaches the
  -- personalized path at all, so DSA compliance is structural.
  if p_user_id is null or not public.can_be_profiled(p_user_id) then
    return query
      select r.id, r.author_id, r.title, r.prompt, r.response,
             r.likes_count, r.comment_count, r.repost_count, r.view_count,
             r.created_at, r.media_urls, r.quoted_echo_id,
             r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
             r.is_verified, r.follower_count, r.rank_score, 'ranked'::text
        from public.get_ranked_feed(p_user_id, p_limit, 1.8, p_cursor_score, p_cursor_id, false) r;
    return;
  end if;

  -- Lazy taste refresh: cost scales with DAU, not registered users.
  select ut.taste_vector, ut.updated_at into v_taste, v_updated
    from public.user_taste ut where ut.user_id = p_user_id;

  if v_updated is null or v_updated < now() - interval '6 hours' then
    perform public.refresh_user_taste(p_user_id);
    select ut.taste_vector into v_taste
      from public.user_taste ut where ut.user_id = p_user_id;
  end if;

  return query
  with seen as (
    select v.echo_id from public.echo_views v
     where v.user_id = p_user_id
       and v.created_at > now() - interval '90 days'
  ),
  eligible as (
    select e.*
      from public.public_echoes e
     where e.check_content = true
       and e.author_id <> p_user_id
       and not exists (select 1 from public.user_blocks b
                        where b.blocker_id = p_user_id and b.blocked_id = e.author_id)
       and not exists (select 1 from public.user_mutes m
                        where m.muter_id = p_user_id and m.muted_id = e.author_id)
       and not exists (select 1 from public.user_not_interested ni
                        where ni.user_id = p_user_id
                          and (ni.echo_id = e.id or ni.author_id = e.author_id))
       and not exists (select 1 from seen s where s.echo_id = e.id)
  ),
  cand_follow as (
    select el.id, 'follow'::text as source from eligible el
     where exists (select 1 from public.follows f
                    where f.follower_id = p_user_id and f.following_id = el.author_id)
     order by el.created_at desc limit 100
  ),
  cand_semantic as (
    select el.id, 'semantic'::text as source from eligible el
     where v_taste is not null and el.embedding is not null
     order by el.embedding <=> v_taste asc limit 100
  ),
  cand_trending as (
    select el.id, 'trending'::text as source from eligible el
     join public.trending_echoes_mv mv on mv.id = el.id
     order by mv.global_score desc limit 100
  ),
  cand_explore as (
    select el.id, 'exploration'::text as source from eligible el
     order by md5(el.id::text || p_session_seed::text) limit 50
  ),
  candidates as (
    select c.id, min(c.source) as source from (
      select * from cand_follow    union all
      select * from cand_semantic  union all
      select * from cand_trending  union all
      select * from cand_explore
    ) c group by c.id
  ),
  scored as (
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (
        coalesce(mv.global_score, 0.01)
        * (
            1
            + 0.6 * greatest(0, 1 - coalesce(e.embedding <=> v_taste, 1))
            + 0.5 * (case when exists (
                select 1 from public.follows f
                 where f.follower_id = p_user_id and f.following_id = e.author_id
              ) then 1 else 0 end)
            + 0.4 * least(coalesce(aff.interactions, 0) / 5.0, 1)
          )
      )::double precision as rank_score,
      c.source
    from candidates c
    join public.public_echoes e on e.id = c.id
    join public.profiles p on p.id = e.author_id
    left join public.trending_echoes_mv mv on mv.id = e.id
    left join lateral (
      select count(*)::float8 as interactions
        from public.echo_likes l
        join public.public_echoes le on le.id = l.echo_id
       where l.user_id = p_user_id and le.author_id = e.author_id
    ) aff on true
  )
  select s.id, s.author_id, s.title, s.prompt, s.response,
         s.likes_count, s.comment_count, s.repost_count, s.view_count,
         s.created_at, s.media_urls, s.quoted_echo_id,
         s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
         s.is_verified, s.follower_count, s.rank_score, s.source
    from scored s
   where p_cursor_score is null
      or s.rank_score < p_cursor_score
      or (s.rank_score = p_cursor_score and s.id < p_cursor_id)
   order by s.rank_score desc, s.id desc
   limit p_limit;
end;
$$;

revoke all on function public.get_personal_feed(uuid, int, float8, uuid, int) from public, anon;
grant execute on function public.get_personal_feed(uuid, int, float8, uuid, int) to authenticated, service_role;
```

- [ ] **Step 2: Apply it**

Run: `supabase db push --linked`
Expected: migration applies cleanly.

- [ ] **Step 3: Verify it runs, respects moderation, and excludes seen**

```sql
with u as (select user_id from public.echo_likes group by user_id order by count(*) desc limit 1)
select
  (select count(*) from public.get_personal_feed((select user_id from u), 20)) as rows_returned,
  (select count(*) from public.get_personal_feed((select user_id from u), 200) f
     join public.public_echoes e on e.id = f.id
    where e.check_content = false) as unmoderated_leaked,
  (select count(*) from public.get_personal_feed((select user_id from u), 200) f
     where f.author_id = (select user_id from u)) as own_posts_leaked;
```

Expected: `rows_returned > 0`, `unmoderated_leaked = 0`, `own_posts_leaked = 0`.

- [ ] **Step 4: Verify the non-profilable path falls back**

```sql
select count(*) as fallback_rows, count(*) filter (where source <> 'ranked') as wrong_source
  from public.get_personal_feed(null, 20);
```

Expected: `wrong_source = 0` — a null/non-profilable caller gets the `ranked` fallback.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(feed): get_personal_feed with candidate generation and personalized scoring"
```

---

### Task 5: Diversity and graceful degradation in SQL

Task 4 returns the top `p_limit` by score with no author cap and no backfill. This task adds both, so the page can neither be dominated by one author nor come back empty.

**Files:**
- Create: `supabase/migrations/<timestamp>_personal_feed_diversity.sql`

**Interfaces:**
- Consumes: `public.get_personal_feed` (Task 4)
- Produces: same signature, now diversity-constrained with seen-item backfill

- [ ] **Step 1: Write the migration**

Replace the final `select` of `get_personal_feed` (everything after the `scored` CTE) with the block below. Keep the rest of the function from Task 4 byte-identical.

```sql
  , primary_pick as (
    -- Over-fetch: return more than the page so the client-side selector in
    -- lib/feedSelection.ts has room to apply the author cap and the
    -- exploration reserve. Those rules live in TypeScript because they are
    -- unit-tested there; SQL only ranks.
    select s.*, 0 as tier from scored s
  ),
  -- Backfill: with a small corpus, seen-exclusion empties the feed within days.
  -- Re-surface seen echoes ranked below every unseen one, decayed by how
  -- recently they were seen. An empty feed is a worse failure than a repeat.
  backfill as (
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (coalesce(mv.global_score, 0.01)
        / (1 + extract(epoch from (now() - v.created_at)) / 86400.0))::double precision as rank_score,
      'reseen'::text as source,
      1 as author_rank,
      1 as tier
    from public.echo_views v
    join public.public_echoes e on e.id = v.echo_id
    join public.profiles p on p.id = e.author_id
    left join public.trending_echoes_mv mv on mv.id = e.id
    where v.user_id = p_user_id
      and e.check_content = true
      and e.author_id <> p_user_id
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = p_user_id and b.blocked_id = e.author_id)
      and not exists (select 1 from public.user_mutes m
                       where m.muter_id = p_user_id and m.muted_id = e.author_id)
      and not exists (select 1 from public.user_not_interested ni
                       where ni.user_id = p_user_id
                         and (ni.echo_id = e.id or ni.author_id = e.author_id))
    order by v.created_at asc
    limit p_limit
  ),
  merged as (
    select * from primary_pick
    union all
    select * from backfill
  )
  select m.id, m.author_id, m.title, m.prompt, m.response,
         m.likes_count, m.comment_count, m.repost_count, m.view_count,
         m.created_at, m.media_urls, m.quoted_echo_id,
         m.username, m.display_name, m.bio, m.avatar_color, m.avatar_url,
         m.is_verified, m.follower_count, m.rank_score, m.source
    from merged m
   where p_cursor_score is null
      or m.rank_score < p_cursor_score
      or (m.rank_score = p_cursor_score and m.id < p_cursor_id)
   order by m.tier asc, m.rank_score desc, m.id desc
   limit p_limit * 3;
end;
$$;
```

Note the `limit p_limit * 3`: the RPC over-fetches and the client trims to
`p_limit` after applying diversity. Without the over-fetch, an author cap
applied client-side could only ever shrink the page.

- [ ] **Step 2: Apply it**

Run: `supabase db push --linked`
Expected: migration applies cleanly.

- [ ] **Step 3: Verify the author cap holds**

The author cap is enforced client-side (Task 6), so at this layer only verify
the RPC over-fetches and still ranks sanely:

```sql
with u as (select user_id from public.echo_likes group by user_id order by count(*) desc limit 1)
select count(*) as rows_returned,
       count(*) filter (where rank_score is null) as null_scores
  from public.get_personal_feed((select user_id from u), 20);
```

Expected: `rows_returned > 0` and up to `60` (3 × limit), `null_scores = 0`.

- [ ] **Step 4: Verify the feed never comes back empty**

Mark every echo as seen for a probe user, then confirm the feed still fills:

```sql
with u as (select user_id from public.echo_likes group by user_id order by count(*) desc limit 1)
insert into public.echo_views (echo_id, user_id)
select e.id, (select user_id from u) from public.public_echoes e
on conflict do nothing;

with u as (select user_id from public.echo_likes group by user_id order by count(*) desc limit 1)
select count(*) as rows_when_everything_seen,
       count(*) filter (where source = 'reseen') as from_backfill
  from public.get_personal_feed((select user_id from u), 20);
```

Expected: `rows_when_everything_seen > 0` — this is the regression the whole design exists to prevent.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(feed): per-author diversity cap and seen-item backfill for the personal feed"
```

---

### Task 6: Client wiring — `fetchPersonalFeed`

**Files:**
- Modify: `lib/supabaseEchoApi.ts` (add beside `fetchSemanticFeed`, around line 863)
- Modify: `src/features/feed/api/useFeed.ts` (the `feedScope === 'semantic'` branches)

**Interfaces:**
- Consumes: `public.get_personal_feed` (Tasks 4–5)
- Produces: `fetchPersonalFeed(options?: { limit?: number; cursor?: RankedFeedCursor; sessionSeed?: number }): Promise<FeedItem[]>`

- [ ] **Step 1: Add the fetcher**

In `lib/supabaseEchoApi.ts`, mirroring `fetchRankedFeed`'s shape. Add these
imports and the row type first:

```ts
import { applyDiversity, type SelectableItem } from './feedSelection';

// get_personal_feed returns the ranked-feed columns plus the candidate source.
type PersonalFeedRow = RankedFeedRow & {
  source: 'follow' | 'semantic' | 'trending' | 'exploration' | 'reseen';
};
```

```ts
/**
 * Personalized For You feed. Falls back server-side to the ranked feed for
 * users who cannot be profiled, so callers never need to branch on consent.
 */
export async function fetchPersonalFeed(options: {
  limit?: number;
  cursor?: RankedFeedCursor;
  sessionSeed?: number;
} = {}): Promise<FeedItem[]> {
  const uid = await getSessionUserId();
  if (!uid) return [];

  const { data, error } = await supabase.rpc('get_personal_feed', {
    p_user_id: uid,
    p_limit: options.limit ?? 20,
    p_cursor_score: options.cursor?.score ?? null,
    p_cursor_id: options.cursor?.id ?? null,
    p_session_seed: options.sessionSeed ?? 0,
  });

  if (error) throw error;

  const overFetched = (data ?? []) as PersonalFeedRow[];
  if (overFetched.length === 0) return [];

  // The RPC over-fetches (3 × limit) and ranks; the author cap and exploration
  // reserve are applied here, where they are unit-tested.
  const selected = applyDiversity(
    overFetched.map(r => ({
      id: r.id,
      authorId: r.author_id,
      score: r.rank_score,
      source: (r.source === 'reseen' ? 'trending' : r.source) as SelectableItem['source'],
      row: r,
    })),
    { limit: options.limit ?? 20, perAuthorCap: 2, explorationShare: 0.2 },
  );
  const rows = selected.map(s => s.row);

  const profileById = new Map<string, SupabaseProfileRow>(
    rows.map(r => [r.author_id, {
      id: r.author_id,
      username: r.username,
      display_name: r.display_name,
      bio: r.bio,
      avatar_color: r.avatar_color,
      avatar_url: r.avatar_url,
      is_verified: r.is_verified,
      created_at: '',
      follower_count: r.follower_count,
    }])
  );

  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  let reposted = new Set<string>();
  const ids = rows.map(r => r.id);
  const [{ data: likeRows }, { data: bmRows }, { data: repostRows }] = await Promise.all([
    supabase.from('echo_likes').select('echo_id').eq('user_id', uid),
    supabase.from('echo_bookmarks').select('echo_id').eq('user_id', uid),
    supabase.from('echo_reposts').select('echo_id').eq('user_id', uid).in('echo_id', ids),
  ]);
  liked = new Set((likeRows ?? []).map((r: { echo_id: string }) => r.echo_id));
  bookmarked = new Set((bmRows ?? []).map((r: { echo_id: string }) => r.echo_id));
  reposted = new Set((repostRows ?? []).map((r: { echo_id: string }) => r.echo_id));

  return await translateFeedItems(rows.map(row =>
    mapEchoRowToFeedItem(
      { ...row, rank_score: row.rank_score } as SupabaseEchoRow,
      profileById.get(row.author_id),
      liked, bookmarked, reposted
    )
  ));
}
```

- [ ] **Step 2: Point the semantic scope at it**

In `src/features/feed/api/useFeed.ts`, in **both** hooks, replace the `fetchSemanticFeed(...)` call inside the `feedScope === 'semantic'` branch with `fetchPersonalFeed({ limit, cursor, sessionSeed })`. Keep the existing try/catch fallback to the ranked feed exactly as it is — the server already falls back for non-profilable users, and the client fallback still covers RPC failure.

Add a stable per-mount seed at the top of each hook so pagination is deterministic within a scroll session:

```ts
const sessionSeed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/supabaseEchoApi.ts src/features/feed/api/useFeed.ts
git commit -m "feat(feed): point the For You tab at get_personal_feed"
```

---

### Task 7: Persist "not interested"

`notInterestedIds` exists in the client store but never reaches the server, so the ranker cannot honour it. This task closes that loop.

**Files:**
- Modify: `lib/supabaseEchoApi.ts`

**Interfaces:**
- Consumes: `public.user_not_interested` (Task 1)
- Produces: `markNotInterested(target: { echoId: string } | { authorId: string }): Promise<void>`

- [ ] **Step 1: Add the writer**

```ts
/**
 * Records a negative signal so the personalized ranker stops surfacing this
 * echo, or this author, for the current user. Best-effort: a failure here must
 * never block the UI gesture that triggered it.
 */
export async function markNotInterested(
  target: { echoId: string } | { authorId: string },
): Promise<void> {
  const uid = await getSessionUserId();
  if (!uid) return;

  const row = 'echoId' in target
    ? { user_id: uid, echo_id: target.echoId, author_id: null }
    : { user_id: uid, echo_id: null, author_id: target.authorId };

  const { error } = await supabase.from('user_not_interested').insert(row);
  // Unique-violation means it is already recorded; nothing to do.
  if (error && error.code !== '23505') {
    captureException(error, { tags: { source: 'mark_not_interested' } });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the write lands and the ranker honours it**

Call `markNotInterested` from the app (or insert manually), then:

```sql
with u as (select user_id from public.user_not_interested limit 1)
select count(*) as suppressed_still_showing
  from public.get_personal_feed((select user_id from u), 200) f
 where exists (
   select 1 from public.user_not_interested ni
    where ni.user_id = (select user_id from u)
      and (ni.echo_id = f.id or ni.author_id = f.author_id)
 );
```

Expected: `suppressed_still_showing = 0`.

- [ ] **Step 4: Commit**

```bash
git add lib/supabaseEchoApi.ts
git commit -m "feat(feed): persist not-interested signals for the personal ranker"
```

---

## Verification after all tasks

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx vitest run` — all tests pass
- [ ] `npx eslint lib src --ext .ts,.tsx` — no new errors
- [ ] For You returns a full page for a user who has seen everything (Task 5, Step 4)
- [ ] No unmoderated echo appears in any surface (Task 4, Step 3)
- [ ] `supabase migration list --linked` — every new timestamp shows in the Remote column

## Deliberately out of scope

Per the spec's non-goals: collaborative filtering, a learned model, real-time taste updates, and reviving `thoughtfulness_score`. Also out of scope and tracked separately: `echo_views` retention/partitioning, and impression logging to replace tap-based "seen".

### Deviation from the spec: MMR dedup deferred

The spec's Stage 3 lists "MMR-style dedup on embedding similarity" alongside the
author cap and exploration reserve. This plan implements the latter two and
**defers MMR**, deliberately:

- Doing it client-side would mean shipping 768-dimension embeddings for ~60 rows
  per page (roughly 0.9 MB of floats per feed load) purely to compute pairwise
  distances. That is unacceptable on mobile.
- Doing it in SQL requires a greedy plpgsql loop over candidates with a vector
  comparison per already-selected item. That is implementable and not expensive
  at 300 candidates, but it is meaningfully more complex than the rest of the
  pipeline.
- Its value right now is near zero: with 12 authors and a 2-per-author cap, the
  page cannot contain enough near-duplicates for MMR to change the result.

The correct time to add it is when the corpus is large enough that several
distinct authors post near-identical takes on the same day. At that point it
belongs in SQL, as a greedy pass inside `get_personal_feed` between `scored` and
`primary_pick`.
