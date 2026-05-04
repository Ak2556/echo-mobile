-- Remove stale like-notifications when a like is undone.
-- Without this, "X liked your echo" persists in the notification list
-- even after the user has already unliked it.

create or replace function public.cleanup_on_echo_unlike()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where type       = 'like'
    and actor_id   = old.user_id
    and target_id  = old.echo_id::text
    and target_kind = 'echo';
  return old;
end;
$$;

drop trigger if exists on_echo_unliked_cleanup on public.echo_likes;
create trigger on_echo_unliked_cleanup
  after delete on public.echo_likes
  for each row execute procedure public.cleanup_on_echo_unlike();
