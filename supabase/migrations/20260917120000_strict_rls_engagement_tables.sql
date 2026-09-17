-- Strict RLS for the engagement and social-graph tables.
--
-- 20260910120000 established the rule for echoes: what you may see depends on
-- whether you may see the author (public.can_view_echo_author). 20260916120000
-- applied it to public_echoes and daily_answers. Fourteen sibling tables were
-- never brought along, and each still carried its original
-- `for select using (true)`.
--
-- That matters more than it looks, because Postgres OR-combines permissive
-- policies. A surviving `using (true)` does not merely leave a table open — it
-- silently cancels every stricter policy added next to it. Tightening a table
-- means removing the open policy, not adding a narrow one beside it.
--
-- Measured against production on 2026-09-17 with nothing but the anon key that
-- ships inside the app bundle, signed out: 65 rows of the follow graph, 302
-- likes, 41 comments, 23 comment likes, 9 answer reactions and 5 reposts. Each
-- row names a user and what they engaged with, so the set reconstructs the
-- activity of accounts marked is_private — the exact thing public_echoes' RLS
-- exists to prevent.
--
-- Two shapes of predicate, and nothing else:
--
--   attached rows  — visible when the thing they hang off is visible. The
--                    subquery reads the parent table as the caller, so the
--                    parent's own RLS decides, and this stays correct when the
--                    parent's rules change.
--   actor rows     — visible when the acting user is visible, via
--                    can_view_echo_author. For anon, auth.uid() is null, so it
--                    reduces to "the actor is a public account", which is right.
--
-- Deliberately left open, and why:
--   badges, quests, daily_questions, daily_question_bank  catalogue rows, no user in them
--   feature_flags                                         the app reads flags before sign-in
--   salons                                                a public directory; membership is gated below
--   profiles                                              row-hiding would break every screen. The
--                                                         control there is column grants: is_private and
--                                                         the settings columns are granted to
--                                                         authenticated only, never to anon.
--
-- Pinned by lib/securityHardening.test.ts, which now asserts this across every
-- table rather than the two that had been fixed by hand.

begin;

-- ── attached to an echo: public_echoes' RLS decides ──────────────────────────
drop policy if exists "echo_reactions select all" on public.echo_reactions;
create policy "echo_reactions follow echo visibility" on public.echo_reactions
  for select using (exists (select 1 from public.public_echoes e where e.id = echo_reactions.echo_id));

drop policy if exists "echo_mentions select all" on public.echo_mentions;
create policy "echo_mentions follow echo visibility" on public.echo_mentions
  for select using (exists (select 1 from public.public_echoes e where e.id = echo_mentions.echo_id));

drop policy if exists "Reposts are viewable" on public.echo_reposts;
drop policy if exists "Anon can read reposts" on public.echo_reposts;
create policy "echo_reposts follow echo visibility" on public.echo_reposts
  for select using (exists (select 1 from public.public_echoes e where e.id = echo_reposts.echo_id));

-- ── attached to a comment: echo_comments' RLS decides ────────────────────────
drop policy if exists "Comment likes viewable by all" on public.comment_likes;
create policy "comment_likes follow comment visibility" on public.comment_likes
  for select using (exists (select 1 from public.echo_comments c where c.id = comment_likes.comment_id));

drop policy if exists "comment_reactions select all" on public.comment_reactions;
create policy "comment_reactions follow comment visibility" on public.comment_reactions
  for select using (exists (select 1 from public.echo_comments c where c.id = comment_reactions.comment_id));

drop policy if exists "comment_mentions select all" on public.comment_mentions;
create policy "comment_mentions follow comment visibility" on public.comment_mentions
  for select using (exists (select 1 from public.echo_comments c where c.id = comment_mentions.comment_id));

-- ── attached to a daily answer: daily_answers' RLS decides ───────────────────
drop policy if exists "daily_answer_reactions select all" on public.daily_answer_reactions;
create policy "daily_answer_reactions follow answer visibility" on public.daily_answer_reactions
  for select using (exists (select 1 from public.daily_answers a where a.id = daily_answer_reactions.answer_id));

-- ── actor rows: the acting user must be visible ──────────────────────────────
-- Both ends of a follow edge, because the edge discloses each to the other.
drop policy if exists "Follows are viewable by everyone" on public.follows;
drop policy if exists "Anon can read follows" on public.follows;
create policy "follows require both parties visible" on public.follows
  for select using (
    public.can_view_echo_author(follows.follower_id)
    and public.can_view_echo_author(follows.following_id)
  );

drop policy if exists "user_badges select all" on public.user_badges;
create policy "user_badges follow holder visibility" on public.user_badges
  for select using (public.can_view_echo_author(user_badges.user_id));

drop policy if exists "salon_members select all" on public.salon_members;
create policy "salon_members follow member visibility" on public.salon_members
  for select using (public.can_view_echo_author(salon_members.user_id));

drop policy if exists "office_hours select all" on public.office_hours;
create policy "office_hours follow host visibility" on public.office_hours
  for select using (public.can_view_echo_author(office_hours.host_id));

drop policy if exists "oh_questions select all" on public.office_hour_questions;
create policy "oh_questions follow asker visibility" on public.office_hour_questions
  for select using (public.can_view_echo_author(office_hour_questions.asker_id));

drop policy if exists "oh_rsvps select all" on public.office_hour_rsvps;
create policy "oh_rsvps follow attendee visibility" on public.office_hour_rsvps
  for select using (public.can_view_echo_author(office_hour_rsvps.user_id));

drop policy if exists "oh_upvotes select all" on public.office_hour_question_upvotes;
create policy "oh_upvotes follow voter visibility" on public.office_hour_question_upvotes
  for select using (public.can_view_echo_author(office_hour_question_upvotes.user_id));

commit;
