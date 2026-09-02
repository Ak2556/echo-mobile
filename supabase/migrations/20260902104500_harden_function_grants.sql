-- Harden function grants and pin search_path.
--
-- Context: the Supabase security advisor flags 8 SECURITY DEFINER functions as
-- executable by `anon`, plus 4 functions with a mutable search_path. Reading
-- each body first: none of them is exploitable today.
--
--   * enforce_minor_profiling_off, validate_date_of_birth and
--     fn_friend_daily_answer_notify return `trigger`. PostgREST does not expose
--     trigger functions as RPCs and Postgres refuses to call them directly, so
--     the grant is inert.
--   * get_dm_conversations, mark_messages_read, ping_presence,
--     increment_ad_click and increment_ad_view all derive the acting user from
--     auth.uid(). Called as anon, auth.uid() is null and they return or affect
--     nothing.
--   * the 4 mutable-search_path functions are SECURITY INVOKER, where
--     search_path is not a privilege-escalation vector.
--
-- This migration is therefore defence in depth, not an incident fix. The value
-- is that a future edit which drops an auth.uid() check no longer has anon
-- reachability waiting behind it, and the advisor stops emitting 12 warnings
-- that hide a real one.
--
-- Deliberately NOT addressed here: increment_ad_click / increment_ad_view let
-- any authenticated user increment any ad's counters with no dedup or rate
-- limit, and ads carry budget_amount / razorpay_order_id / payment_status.
-- That is a genuine integrity problem and needs a dedup design, not a grant
-- change.

begin;

-- 1. Revoke the default PUBLIC/anon EXECUTE on the flagged SECURITY DEFINER
--    functions. `authenticated` and `service_role` keep what they need.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'enforce_minor_profiling_off',
         'validate_date_of_birth',
         'fn_friend_daily_answer_notify',
         'get_dm_conversations',
         'mark_messages_read',
         'ping_presence',
         'increment_ad_click',
         'increment_ad_view'
       )
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end;
$$;

-- The five callable RPCs must stay reachable by signed-in users.
grant execute on function public.get_dm_conversations(uuid) to authenticated;
grant execute on function public.mark_messages_read(uuid)    to authenticated;
grant execute on function public.ping_presence()             to authenticated;
grant execute on function public.increment_ad_click(uuid)    to authenticated;
grant execute on function public.increment_ad_view(uuid)     to authenticated;

-- The three trigger functions need no grants at all: a trigger executes as the
-- table owner regardless of who performed the INSERT/UPDATE.

-- 2. Pin search_path on the four functions that lack it, so behaviour cannot
--    change if a caller sets a different search_path.
alter function public.minimum_age_years()               set search_path = public;
alter function public.adult_age_years()                 set search_path = public;
alter function public.check_ad_payment_status()         set search_path = public;
alter function public.fn_learn_booking_requires_party() set search_path = public;

commit;
