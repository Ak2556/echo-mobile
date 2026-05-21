# Echo iOS — Gen Z Feature Plan

## Context
Echo has the bones of a knowledge-curation network (Q→A echoes, streaks/XP, polls, quote-remix, Stories, hashtags, notifications, DMs with reactions) but is missing the social mechanics Gen Z expects from TikTok, Instagram, Threads, BeReal, Snap, Discord. This plan ships those features re-skinned to fit Echo's "curated knowledge" identity — every name and visual cue reinforces the Q→A vibe rather than copy-pasting the source app.

The user has signed off on shipping the full set, in depth, error-proof. To keep progress durable, work is broken into **four waves** with their own commits.

---

## Feature → Echo Re-skin Mapping

| Source app pattern | Echo version | Files |
|---|---|---|
| Twitter @-mentions | **@-mentions** — autocomplete in composer + comments, linkified rendering, mention notifications | `app/create-post.tsx`, `app/comments.tsx`, `components/social/MentionInput.tsx` (new), DB: `echo_mentions`, `comment_mentions` |
| IG / Slack emoji reactions | **Reaction piles** — four knowledge reactions: 🤯 mind-blown, 📝 taking notes, 💯 agree, 🤔 disagree (no negativity, no clout-loss) | `components/social/ReactionBar.tsx` (new), `components/social/FeedCard.tsx`, DB: `echo_reactions`, `comment_reactions` |
| Reddit / Twitter threads | **Threaded replies** — UI on the existing `parent_comment_id` column | `app/comments.tsx` |
| IG Notes (status) | **Mood** — 60-char status that expires in 24h, shown on profile + above name in FeedCard | `app/edit-profile.tsx`, `components/social/FeedCard.tsx`, `app/(tabs)/profile.tsx`, profile field `mood`, `mood_expires_at` |
| BeReal daily prompt | **Daily Question** — one rotating question per day, you see others' answers only after you post yours | `app/daily-question.tsx` (new), edge function `daily-question-rotator`, DB: `daily_questions`, `daily_answers` |
| Discord servers / Reddit subs | **Salons** — topic-based circles you join; salon-scoped feeds | `app/salon/[slug].tsx`, `app/salons.tsx` (browse), `app/create-salon.tsx`, DB: `salons`, `salon_members`, extend `public_echoes.salon_id` |
| IG Collab posts | **Co-Echoes** — two users answer the same prompt side-by-side | `app/create-post.tsx` (collab mode), `components/social/FeedCard.tsx`, DB: extend `public_echoes` with `co_author_id`, `co_author_response` |
| Twitter Spaces / IG AMA | **Office Hours** — scheduled Q&A on your profile, audience submits + upvotes Qs | `app/office-hours.tsx`, `app/office-hours/[id].tsx`, DB: `office_hours`, `office_hour_rsvps`, `office_hour_questions` |
| Snapchat / Stack Overflow badges | **Badges** — auto-awarded for milestones (verified-thinker, streak-keeper, top-of-topic) | `app/badges.tsx`, `components/profile/BadgeShelf.tsx`, DB: `badges`, `user_badges`, award function |
| Spotify Wrapped | **Year in Echo** — annual recap of your top insights, topics, reach | `app/year-in-echo.tsx`, edge function `year-wrap-generate`, DB: `year_wraps` |
| Snap quests, Duolingo streaks | **Quests** — daily/weekly missions ("post one echo", "answer the Daily Question", "give 3 reactions") with XP rewards | `app/quests.tsx`, `components/profile/QuestList.tsx`, DB: `quests`, `user_quests` |
| Topic leaderboards | **Topic Leaderboards** — top contributors per topic (driven from existing `topic_tags` arrays) | `app/topic/[tag].tsx`, SQL view `topic_leaderboard` |
| IG pronouns | **Pronouns** — small text field | `app/edit-profile.tsx`, profile field `pronouns` |
| Activity tab | **Activity** — extended notifications with "who reacted / saved / quoted you" | `app/(tabs)/notifications.tsx` |

---

## Implementation Waves

### Wave 1 — Foundation + Engagement (this session)
**Goal:** unblock everything by shipping all DB schema, then layer the highest-impact engagement features.
- ✅ Single migration `20260521120000_gen_z_features.sql` — all new tables, all profile column additions, all RLS policies, all counter triggers
- ✅ **@-mentions** — composer autocomplete, parsing, notifications, linkified rendering
- ✅ **Reactions beyond like** — picker, count display, optimistic toggle
- ✅ **Threaded comments** — reply UI (DB col already exists)
- ✅ **Profile pronouns + mood** — edit form + 24h expiry + FeedCard surface

### Wave 2 — Daily / Ephemeral
- ✅ **Daily Question** screen + answer composer + reveal-after-answer ritual
- ✅ Cron edge function to rotate the daily prompt
- ✅ **Story reactions** (quick taps from viewer)

### Wave 3 — Communities & Collab
- ✅ **Salons** — browse, create, join, salon-scoped feed
- ✅ **Co-Echoes** — collab composer mode + side-by-side card
- ✅ **Office Hours** — scheduling, RSVP, question feed
- ✅ Activity tab upgrade (who reacted/saved/quoted you)

### Wave 4 — Gamification & Identity
- ✅ **Badges** — definitions, auto-award engine, profile shelf
- ✅ **Year in Echo** — aggregation function + recap screen
- ✅ **Quests** — definitions, progress tracking, completion + reward
- ✅ **Topic Leaderboards** — top contributors per topic
- ✅ AI tool additions for new features (`open_salon`, `open_daily_question`, `react_to_echo`)

---

## DB Schema (Wave 1 migration)

See `supabase/migrations/20260521120000_gen_z_features.sql`. New tables:

- `echo_mentions`, `comment_mentions` — track @-mentions
- `echo_reactions`, `comment_reactions` — 4-emoji reactions with check constraint
- `daily_questions`, `daily_answers` — daily prompt + responses
- `salons`, `salon_members` — communities
- `office_hours`, `office_hour_rsvps`, `office_hour_questions` — scheduled AMA
- `badges`, `user_badges` — achievements
- `year_wraps` — annual recap cache
- `quests`, `user_quests` — missions

Profile column additions: `pronouns text`, `mood text`, `mood_expires_at timestamptz`

`public_echoes` column additions: `salon_id`, `co_author_id`, `co_author_response`

Counter columns added to `public_echoes`:
- `mind_blown_count`, `taking_notes_count`, `agree_count`, `disagree_count`
- Counter triggers on the reaction tables to keep them in sync (same pattern as `comment_likes`)

All new tables: RLS enabled, select-all + insert-own + delete-own policies, FK indices.

---

## Verification (per wave)

Each wave gets a commit. Before each commit:
1. **Type check** — `npx tsc --noEmit`
2. **Migration applied** — `npx supabase db push` (or MCP `apply_migration`)
3. **Smoke flow** — open the app, exercise each new feature, confirm DB rows + counters update
4. **AI integration** — for features that get AI tools, confirm chat can trigger them

---

## Out of Scope (deferred)
- Voice notes in DMs (requires audio recording stack — sizable)
- Group DMs (DB upgrade is moderate, UI is large)
- Push notifications for new types (existing fanout function needs extension)
- Mention autocomplete in DMs (only echoes/comments for first pass)
