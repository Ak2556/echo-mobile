-- Scheduled pushes: claim the work in one statement, so a run can repeat.
--
-- daily-question-push paged every token and pushed from the edge function with
-- nothing recording that the day had gone out: a manual re-run, or pg_cron
-- firing twice, pushed everyone twice. personalized-fanout selected due users,
-- inserted a nudge, then stamped last_nudged_at user by user: two overlapping
-- runs, or a crash between the steps, nudged the same person twice. Both cron
-- commands also hard-coded the production project URL, which has pointed at
-- the wrong project once before (20260705181000).
--
-- Depends on 20260928110000 (job layer).

begin;

select pgmq.create('broadcast');

-- ── daily question ──────────────────────────────────────────────────────────
create table if not exists public.broadcast_runs (
  question_id uuid primary key references public.daily_questions (id) on delete cascade,
  claimed_at  timestamptz not null default now()
);

comment on table public.broadcast_runs is
  'One row per daily question that has been broadcast, so a repeated run sends nothing. Server-only.';

alter table public.broadcast_runs enable row level security;
revoke all on public.broadcast_runs from anon, authenticated;

-- Today's question, once. Returns the number of 'broadcast' jobs enqueued (0
-- when today already went out). ensure_daily_question materialises the row if
-- the bank has not reached today yet, rather than skipping the day.
create or replace function public.claim_daily_broadcast()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question uuid;
  v_batches integer;
begin
  select id into v_question from public.ensure_daily_question(current_date);
  if v_question is null then
    return 0;
  end if;

  insert into public.broadcast_runs (question_id) values (v_question)
  on conflict (question_id) do nothing;
  if not found then
    return 0;
  end if;

  -- Everyone with a device, in batches of 100 users for the worker.
  with recipients as (
    select user_id from public.push_tokens
    union
    select id from public.profiles where push_token is not null
  ),
  numbered as (
    select user_id, (row_number() over (order by user_id) - 1) / 100 as batch
      from recipients
  )
  select count(*) into v_batches
    from (
      select public.jobs_enqueue('broadcast', jsonb_build_object(
               'question_id', v_question, 'user_ids', jsonb_agg(user_id)))
        from numbered
       group by batch
    ) enqueued;
  return v_batches;
end;
$$;

revoke all on function public.claim_daily_broadcast() from public, anon, authenticated;
grant execute on function public.claim_daily_broadcast() to service_role;

do $$
begin
  perform cron.unschedule('daily-question-push');
exception when others then null;
end $$;
-- 13:30 UTC (19:00 IST), as before.
select cron.schedule('daily-question-push', '30 13 * * *', $cron$select public.claim_daily_broadcast();$cron$);

-- ── personalized nudges ─────────────────────────────────────────────────────
-- Stamps and returns the users due a nudge this hour, in one statement.
-- SKIP LOCKED lets a concurrent run take the next users instead of the same
-- ones. Longest-waiting first, bounded, so a backlog drains over hours.
create or replace function public.claim_due_nudges(p_hour integer, p_limit integer, p_min_gap_hours integer)
returns table (user_id uuid, top_surface text, date_of_birth date)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select np.user_id
      from public.notification_profiles np
      join public.profiles p on p.id = np.user_id
     where p.personalized_notifications
       and np.best_hours @> array[p_hour]
       and (np.last_nudged_at is null
            or np.last_nudged_at < now() - make_interval(hours => p_min_gap_hours))
       and (p.push_token is not null
            or exists (select 1 from public.push_tokens t where t.user_id = np.user_id))
     order by np.last_nudged_at nulls first
     limit greatest(p_limit, 0)
     for update of np skip locked
  )
  update public.notification_profiles np
     set last_nudged_at = now()
    from due, public.profiles p
   where np.user_id = due.user_id
     and p.id = due.user_id
  returning np.user_id, np.top_surface, p.date_of_birth;
$$;

revoke all on function public.claim_due_nudges(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_nudges(integer, integer, integer) to service_role;

-- Same job, with the project URL from Vault instead of hard-coded.
do $$
begin
  perform cron.unschedule('personalized-fanout');
exception when others then null;
end $$;
select cron.schedule(
  'personalized-fanout',
  '0 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/personalized-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'personalized_push_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

commit;
