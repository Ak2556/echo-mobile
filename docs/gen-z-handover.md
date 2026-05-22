# Echo iOS — Gen Z Features Handover

Copy-paste the prompt at the bottom into the next session.

---

## Where we are

The "Gen Z features" feature pack is **mostly shipped** on `main`. Eight commits cover the work so far:

| Commit | What it shipped |
|---|---|
| `98aaa9c` | DB foundation (17 tables) + reactions + mood + pronouns |
| `3add3d8` | @-mentions API + LinkifiedText rendering |
| `e209752` | Daily Question + Salons |
| `4a6cf65` | Office Hours + Badges + Quests + Year in Echo |
| `8ee320a` | @-mentions autocomplete dropdown (composer + comments) |
| `98c5b2c` | Co-Echoes — side-by-side collab posts |
| `c7e0b6e` | Activity tab upgrade — reaction/bookmark/quote notifs |
| `f0307ad` | AI tools — react_to_echo, open_daily_question, join_salon, rsvp_office_hour |

The master plan lives at `docs/gen-z-features-plan.md`. The DB schema lives at `supabase/migrations/20260521120000_gen_z_features.sql` (idempotent — safe to re-run on a fresh DB).

## What's live and working end-to-end

- **Reactions** — 4-emoji pile (🤯 📝 💯 🤔) on every FeedCard, optimistic toggle + rollback, counter triggers in DB
- **Mood + Pronouns** — edit-profile UI, mood chip surfaces on FeedCard, 24h auto-expiry
- **@-mentions** — `parseMentions()` + `insertEchoMentions()` + `insertCommentMentions()` wired into publish flows; `LinkifiedText` renders `@user` and `#tag` as tappable in feed bodies
- **Daily Question** — `app/daily-question.tsx`, 7 prompts seeded (2026-05-21 → 27), reveal-after-answer ritual, Discover banner
- **Salons** — `app/salons.tsx` (browse) + `app/create-salon.tsx` + `app/salon/[slug].tsx` (scoped feed); Join/Joined toggle with optimistic updates
- **Office Hours** — `app/office-hours.tsx` (list) + `app/create-office-hour.tsx` + `app/office-hours/[id].tsx` (Q&A with upvote sorting)
- **Badges** — `app/badges.tsx`, 8 seeded; `first_echo` auto-awards on publish
- **Quests** — `app/quests.tsx`, 5 seeded; auto-progress on echo/reaction/answer/mention via `bumpQuestProgress()`
- **Year in Echo** — `app/year-in-echo.tsx`, lazy aggregation in `fetchOrComputeYearWrap()`
- **AI** — `navigate_to` enum extended to all new screens; `chat.tsx` routeMap matches

## What's still on the plan but **not shipped**

Only the three lower-priority items remain:

### 3. Story replies / reactions
### 6. Topic Leaderboards
### 8. Office Hours status cron

(See original item descriptions below — they are unchanged.)

## ✅ Shipped in this session

### 1. @-mentions autocomplete in the composer (DONE in `8ee320a`)

**State:** `searchRemoteUsers(query, limit)` already exists in `lib/supabaseEchoApi.ts`. Just need a UI overlay that listens to the active text input and shows suggestions.

**Files to touch:**
- New: `components/social/MentionSuggestions.tsx` — overlay component that takes the current text + caret position + `onPick(username)` callback
- `app/create-post.tsx` — hook into the response textarea
- `app/comments/[id].tsx` — hook into the comment composer

**Approach:** On each keystroke, find the last `@` token before the caret. If it's at least 1 char long, run `searchRemoteUsers(token)`, render a positioned dropdown above the input with avatars + display name + @handle, tap inserts the username and closes the dropdown.

**Verification:** Type `@a` in create-post → see suggestions → tap one → username appears in the response field → publish → DB has an `echo_mentions` row + a `mention` notification fires.

### 2. Threaded comment replies UI (already shipped before this session in `app/comments/[id].tsx` + `CommentCard`)

**State:** DB column `echo_comments.parent_comment_id` already exists (from `phase1_social` migration). The Comments type already has `parentId` and `replyCount`. `insertRemoteComment` already accepts a `parentCommentId` parameter.

**Files to touch:**
- `app/comments/[id].tsx` — group comments by parent, indent replies, add a "Reply" affordance per comment, pass `parent_comment_id` when in reply mode

**Approach:** Build a tree from the flat comments list. Render top-level comments full-width, replies indented 24-32px. Show "Reply" under each comment; tapping it sets `replyingTo` state and the next submit includes `parent_comment_id`.

### 3. Story replies / reactions

**State:** Stories already exist (`app/create-story.tsx`, `app/story/...`). Need to add per-story reactions table + a reply CTA in the viewer.

**Files to touch:**
- New migration: `story_reactions` table (story_id, user_id, reaction) — mirror of `echo_reactions`
- `app/story/[id].tsx` — bottom-bar reaction picker + "Reply via DM" CTA that opens a new DM with the story embedded

### 4. Co-Echoes (collab posts) (DONE in `98c5b2c`)

**State:** `public_echoes.co_author_id` and `co_author_response` columns already exist.

**Files to touch:**
- `app/create-post.tsx` — add a "Co-author" mode toggle; in collab mode, show a second response field and a user picker that resolves to `co_author_id`
- `components/social/FeedCard.tsx` — when `co_author_id` is set, render a side-by-side card (left = author's response, right = co-author's response) with both avatars
- `lib/mapSupabaseEcho.ts` — extend `FeedItem` with `coAuthor` + `coAuthorResponse` fields

### 5. Activity tab upgrade (DONE in `c7e0b6e`)

**State:** The `notifications` table already supports `mention`, `like`, `comment`, `follow`, `repost`. Just need broader grouping in the UI.

**Files to touch:**
- `app/(tabs)/notifications.tsx` — add new groupings: "X people reacted with 🤯", "X people saved your echo", "X people quoted you". Use the existing `notification_groups` pattern.

### 6. Topic Leaderboards

**State:** Needs a SQL view that ranks contributors per topic by sum of likes + reactions.

**Files to touch:**
- New migration: `create or replace view topic_leaderboard as ...` — group by lower(tag), aggregate per author
- New screen: `app/topic/[tag].tsx` — top contributors + a feed of recent echoes tagged with that topic

### 7. AI tool integrations for new features (DONE in `f0307ad`)

Add tools to the TOOLS array in `supabase/functions/echo-ai/index.ts`:
- `react_to_echo(echo_id, reaction)` — requires confirm, server-side action via supabase client
- `open_daily_question()` — local device, just calls navigate_to
- `join_salon(slug)` — requires confirm, server-side action
- `rsvp_office_hour(id)` — requires confirm

The system prompt vocabulary already mentions `react_to_echo` etc., so the AI is ready to use them once the tool definitions land.

### 8. Office Hours status cron

A small edge function (`office-hours-status-rotator`) that flips `status` from `scheduled` → `live` → `ended` based on `starts_at` / `ends_at`. Schedule it every 5 minutes via `pg_cron` or a scheduled task.

---

## Operating tips for the next session

1. **Working directory:** Always `cd /Users/aena/Developer/echo-ios` before any git commands. There's a worktree at `.claude/worktrees/laughing-mirzakhani-1a224c` that can confuse `git push` — commits go to the wrong branch from there.
2. **Migrations:** **Use the CLI, not the MCP.** The MCP `mcp__supabase__*` tools are connected to a different Supabase project (`eyokhisijabitzjiydmz`) than the app uses (`xmjbhcyyqrjlvhluisfj`). For real migrations to the app's project, run `supabase db push --linked` — Docker is NOT required for `db push`; only `db start`/`db reset` need it. Same for edge functions: `supabase functions deploy <name>`.
3. **Typecheck before commit:** `npx tsc --noEmit` is fast and catches the kind of prop-shape errors that surfaced when I plumbed ProfileAvatar (`avatarColor`, not `color`; `displayName`, not `username`).
4. **Router pushes** to dynamic routes need `as any` cast: `router.push('/salon/foo' as any)` — Expo Router's static type doesn't know about runtime params.
5. **FeedCard** requires an `index` prop now — pass it from any `.map((item, index) => <FeedCard …/>)`.

---

## Verification checklist for what's already shipped

Run these after a fresh build to confirm the existing work still works:

```
[ ] Open the app → Discover tab shows the Daily Question banner
[ ] Tap banner → see today's prompt; submit an answer → others' answers reveal
[ ] Edit profile → add pronouns + mood → mood chip appears on your echoes
[ ] React to any echo → counter ticks; refresh → counter persists
[ ] Type "@user" in create-post body → mention is recognized; publish → mention notification fires to that user
[ ] Open Salons via AI ("take me to salons") → browse list loads
[ ] Create a salon → owner auto-added as member; member_count = 1
[ ] Schedule an Office Hours → it appears in the upcoming list
[ ] Open Quests → "Drop one echo" shows progress 1/1 after publishing
[ ] Open Badges → "First Echo" shows in Earned section
[ ] Open Year in Echo → stats show your YTD totals, top topics, hit echo
```

---

## Handover prompt (paste this into the next session)

> I'm continuing work on the Echo iOS Gen Z feature pack. Four commits have shipped on `main` (last commit `4a6cf65`). The master plan is at `docs/gen-z-features-plan.md` and the detailed handover is at `docs/gen-z-handover.md`. **Read the handover doc first** for full context on what's live and the remaining polish items (1–8).
>
> The DB is fully migrated; all 17 new tables exist with RLS + counter triggers. APIs for all features are in `lib/supabaseEchoApi.ts`. Eleven new screens are wired into the app. AI navigation to every new screen works.
>
> Pick up with the polish items, in this priority order: (1) @-mentions autocomplete dropdown, (2) threaded comment replies UI, (4) co-echoes, (5) activity-tab upgrade, (7) AI tools for new features. Items 3 (story reactions), 6 (topic leaderboards), and 8 (office-hour cron) are lower priority — defer if time runs short.
>
> Operating constraints:
> - Always `cd /Users/aena/Developer/echo-ios` before git commands (a worktree at `.claude/worktrees/...` confuses pushes otherwise)
> - Apply migrations via `mcp__supabase__apply_migration` in chunks, not `supabase db push` (Docker isn't running)
> - Run `npx tsc --noEmit` before every commit — ProfileAvatar uses `avatarColor`/`displayName`/`showGlow` (NOT `color`/`username`), FeedCard requires an `index` prop, router pushes to dynamic routes need `as any` cast
> - Commit per feature with the established `feat(gen-z): …` prefix; push after each commit so progress is durable
>
> Start by running the verification checklist in the handover doc to confirm nothing has regressed, then tackle item 1 (mentions autocomplete). Don't ask permission to proceed — the user has signed off on the full feature set; just ship.
