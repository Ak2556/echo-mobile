-- profiles.follower_count was counting every follow twice.
--
-- follows had two identical triggers (follows_adjust_follower_count and
-- on_follow_change), both AFTER INSERT OR DELETE calling adjust_follower_count,
-- so each follow added 2 and each unfollow removed 2. Measured on production
-- before this migration: 18 of 50 profiles wrong, stored total 131 against an
-- actual 68 (12 vs 6, 10 vs 5, ...). The feed ranker reads this column
-- (log(follower_count + 1)), so ranking was skewed as well.
--
-- Fix: keep one trigger, then recompute every count from the follows table once.
-- With the column right, the app can read it (a primary-key lookup) instead of
-- counting follows rows on every profile view.
begin;

drop trigger if exists on_follow_change on public.follows;

-- Recompute from the source of truth. Two statements so a profile whose last
-- follower left is reset to 0 as well as one whose count is too high.
update public.profiles p
   set follower_count = c.n
  from (select following_id, count(*)::integer as n from public.follows group by following_id) c
 where p.id = c.following_id
   and p.follower_count is distinct from c.n;

update public.profiles p
   set follower_count = 0
 where p.follower_count is distinct from 0
   and not exists (select 1 from public.follows f where f.following_id = p.id);

commit;
