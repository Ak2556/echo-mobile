-- A moderation verdict applies only to the content it judged.
--
-- embed-echo reads a post, asks the model (with retries that sleep), and then
-- wrote its verdict by id alone:
--
--   update public_echoes set check_content = <verdict> where id = <echo>
--
-- An edit in the meantime resets check_content to false and starts a second
-- run. If the first run finishes last, its verdict for the OLD text lands on
-- the NEW text: an edit that was never judged can be published, and a clean
-- edit can be hidden by a stale flag.
--
-- content_version counts content changes. embed-echo reads it with the row and
-- writes its verdict with `where content_version = <what it read>`, so a
-- superseded run matches nothing and the newer run decides.
--
-- The trigger owns the column on every path (client, service role, SQL), so no
-- caller can set it. It also clears moderated_at on a content change: until the
-- new text is judged there is no verdict for it, which is what the ops probe
-- and the column comment already mean by null.

alter table public.public_echoes
  add column if not exists content_version integer not null default 1;

comment on column public.public_echoes.content_version is
  'Bumped by trigger on every change to title, prompt, response or media_urls. A moderation verdict is written only where this still equals the version that was judged.';

create or replace function public.bump_echo_content_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 1;
  elsif (new.title, new.prompt, new.response, new.media_urls)
        is distinct from (old.title, old.prompt, old.response, old.media_urls) then
    new.content_version := old.content_version + 1;
    new.moderated_at := null;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;

revoke all on function public.bump_echo_content_version() from public, anon, authenticated;

-- "d_" sorts after a_guard_client_writes, b_guard_media_provenance and
-- c_hold_moderated_content, so it sees the content those guards settled on.
drop trigger if exists d_bump_echo_content_version on public.public_echoes;
create trigger d_bump_echo_content_version
  before insert or update on public.public_echoes
  for each row execute function public.bump_echo_content_version();
