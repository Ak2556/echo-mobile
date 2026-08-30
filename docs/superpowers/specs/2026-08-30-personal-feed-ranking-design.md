# Personal feed ranking — design

**Date:** 2026-08-30
**Status:** approved design, not yet implemented
**Scope:** the For You tab only

## Purpose

Give each user a For You feed that is worth returning to tomorrow, and build it
so it still works at 10K concurrent / 10M users rather than only at today's
corpus size.

Retention is the north star, expressed as *daily return plus genuine value* —
not session count or time in app. The ranker therefore optimises predicted
engagement under hard diversity and novelty constraints, rather than optimising
attention directly.

## Context: what exists today

- `get_ranked_feed(p_user_id, p_limit, p_gravity, p_cursor_score, p_cursor_id, p_following_only)`
  scores `global_score` (from `trending_echoes_mv`) × author authority × follow
  boost, filters blocks/mutes, and keyset-paginates on `(score, id)`.
- `get_semantic_feed(p_user_id, p_limit)` builds a taste vector as the mean of
  the user's last 20 liked embeddings **on every request**, then orders by
  cosine distance. This powers For You today.
- `lib/feedScoring.ts` mirrors the SQL formula for offline/local mode.
- `feedScope` ∈ `semantic | trending | following | latest`; `feedSort` toggles
  gravity between recency- and engagement-heavy.
- `notInterestedIds` and `interests` exist in the client store but never reach
  the server, so neither influences ranking.

### Measured facts that shaped this design (2026-08-30)

| Fact | Value | Consequence |
|---|---|---|
| Echoes | 74 | No collaborative filtering signal yet |
| Distinct authors | 12 | Per-author diversity cap yields ≤24 items |
| Profiles | 52 | No training labels for a learned model |
| Mean response length | 33 chars | Ranking for "depth" would rank noise |
| `conversation_snapshot` | NULL on all rows | `thoughtfulness_score` depth term is always 0 |
| `thoughtfulness_score` | avg 0.00, max 0.0795 | Signal is dead; excluded from v1 |
| AI quota | free tier, ~20 req/day | No per-request embedding generation is affordable |

### Infrastructure already in place

- `public_echoes_embedding_hnsw_idx` — HNSW cosine index (ANN retrieval ready)
- `public_echoes_check_content_created_idx` — partial index on `check_content = true`
- `echo_views_pkey (echo_id, user_id)`, `echo_views_user_idx (user_id)`
- `follows_follower_idx`, `idx_public_echoes_author (author_id, created_at DESC)`

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Compute model | Two-stage on-demand in Postgres | Fresh at request time, no per-user storage blowup, stays in the existing stack |
| Objective | Predicted engagement under hard diversity/novelty constraints | Learns from signals already collected; constraints prevent collapse into a hot-take bubble |
| Rollout | New ranker powers For You only | Trending/Following/Latest keep working; a bad ranking cannot take the app down |
| Taste refresh | Lazy on read, 6h staleness | Cost scales with DAU, not registered users; removes a cron rather than adding one |

## Architecture

New RPC `get_personal_feed(p_user_id, p_limit, p_cursor_score, p_cursor_id, p_session_seed)`.

### Stage 0 — eligibility

Call `can_be_profiled(p_user_id)`. When false (minor, or profiling not
consented), delegate to `get_ranked_feed` unchanged. DSA compliance is
structural: a non-profiled user cannot reach the personalised path at all.

### Stage 1 — candidate generation (~300 rows, all index-backed)

Union of four capped sources:

| Source | Retrieval | Index |
|---|---|---|
| Follow graph | Recent echoes from followed authors | `follows_follower_idx` → `idx_public_echoes_author` |
| Semantic | ANN neighbours of the cached taste vector | `public_echoes_embedding_hnsw_idx` |
| Trending | Top slice of `trending_echoes_mv` | `trending_echoes_mv_score_idx` |
| Exploration | Random recent approved echoes outside the above | `public_echoes_check_content_created_idx` |

Every source is filtered by `check_content = true`, author not blocked or muted,
author is not the viewer, and the echo is **not already seen** (anti-join against
`echo_views`, bounded to the last 90 days).

### Stage 2 — scoring, over candidates only

```
score = base × affinity × penalty

base     = coalesce(mv.global_score, floor)
affinity = 1
         + 0.6 · max(0, 1 − (embedding <=> taste))
         + 0.5 · is_following
         + 0.4 · min(author_affinity / 5, 1)
penalty  = 0 when not_interested, else 1
```

- `base` reuses `global_score`, which **already contains** recency decay
  (gravity 1.8), engagement rate and media boost. No second freshness term is
  applied; double-decaying is the standard way these formulas silently become
  recency-only.
- `floor` is required rather than `coalesce(…, 0)`. The MV covers 30 days, so a
  strong semantic match older than that would otherwise score exactly zero and
  never surface, quietly making For You a 30-day window. `floor` is a small
  positive constant, initially `0.01` — low enough that a fresh trending echo
  always outranks an old one on `base` alone, high enough that affinity can lift
  an older item into the page.
- `author_affinity` is the viewer's count of past likes and comments on that
  author, saturating at 5.

### Stage 3 — constrained selection

Diversity is enforced, not hoped for:

- at most 2 echoes per author per page
- ~20% of slots reserved for the exploration bucket
- MMR-style dedup on embedding similarity, so near-identical takes do not stack

### Graceful degradation (small corpus)

With 74 echoes, seen-exclusion exhausts the corpus in under a week of daily use
and For You would go empty — a worse failure than repetition. When unseen
candidates fall below the page size, backfill with **seen** items ranked down by
a re-surface decay based on time since seen. This is a permanent property, useful
at 10M items too, and matches the agreed "graceful degradation, never literally
zero" stance.

### Cold start

Below ~3 likes there is no meaningful taste vector; affinity degrades to follow
and author terms, and the candidate mix shifts to trending 50 / follow 30 /
exploration 20. The onboarding `interests` the client already collects seed the
initial taste vector from those strings' embeddings, so a new user gets a
personalised For You on day one instead of generic trending.

## New state

| Object | Shape | Notes |
|---|---|---|
| `user_taste` | `user_id` PK, `taste_vector vector(768)`, `top_authors uuid[]`, `updated_at` | One row per user; lazily refreshed. Makes the HNSW index usable — a cached constant vector is index-searchable, today's per-request `avg(embedding)` CTE is not. |
| `user_not_interested` | `user_id`, `echo_id` (nullable), `author_id` (nullable), `created_at`, CHECK exactly one of the two is set | Promotes the client-only `notInterestedIds` to a real ranking signal. One row hides a single echo; an `author_id` row suppresses that author for the viewer. Both feed the same `penalty = 0` term. |
| seen-state | reuses `echo_views` | No new table |

Required new index: `echo_views (user_id, created_at DESC)`. Without it,
"seen in the last 90 days" degrades to scanning a heavy user's whole view
history on every feed load.

## Known weaknesses, accepted

- **`echo_views` records a card tap, not an impression**, so "seen" is
  under-counted. Shipping on it is better than adding a second write path now;
  impression logging can come later.
- **`echo_views` becomes the largest table.** It is already the highest-write
  table, grows without bound, and seen-exclusion makes it load-bearing for the
  feed. It needs a retention policy (prune beyond ~90 days) or monthly
  partitioning before 10K concurrent. Tracked as its own P1, not solved here.
- **Pagination stability.** Keyset on `(score, id)` assumes stable scores, but
  taste can refresh and the exploration bucket is random, so pages can duplicate
  or skip. Mitigated by `p_session_seed`, which seeds the exploration sample, and
  by freezing the taste vector for the cursor's lifetime rather than re-reading
  per page.

## Non-goals

Explicitly not built, each because the data does not yet justify a second system
to maintain:

- collaborative filtering — no co-engagement density
- a learned ranking model — no training labels
- real-time taste updates — 6h staleness is invisible to users
- reviving `thoughtfulness_score` — miscalibrated and structurally zero; a
  separate piece of work if quality weighting is wanted later

## Cost envelope

Per request: four bounded index scans (~300 candidates), one HNSW ANN lookup,
and arithmetic over 300 rows. No table scan, no per-request embedding
generation, no AI API call. Should perform comparably to the current ranked
feed, not worse.

## Testing

- **Unit (pure TS, vitest):** selection constraints — per-author cap, exploration
  share, MMR dedup, re-surface backfill ordering. These are the rules most likely
  to regress silently and are testable without a database.
- **SQL:** `get_personal_feed` returns only `check_content = true`; excludes
  blocked, muted, self-authored and seen echoes; never returns fewer than
  `p_limit` rows while any candidate remains; a non-profilable user receives the
  `get_ranked_feed` result.
- **Pagination:** two successive pages with the same `session_seed` contain no
  duplicates and skip nothing.
- **Regression:** For You must not go empty at current corpus size — the failure
  this design exists to prevent.
