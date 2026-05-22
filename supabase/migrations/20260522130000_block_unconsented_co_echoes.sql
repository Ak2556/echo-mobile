-- Block new co-echo attribution until a co-author approval flow exists.
-- Without consent, any echo author can attach another user's id and write
-- a response on their behalf.

create or replace function public.block_unconsented_co_echo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.co_author_id is not null
     or nullif(btrim(coalesce(new.co_author_response, '')), '') is not null then
    raise exception 'Co-author posting requires co-author approval';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_unconsented_co_echo on public.public_echoes;
create trigger trg_block_unconsented_co_echo
  before insert or update of co_author_id, co_author_response on public.public_echoes
  for each row execute function public.block_unconsented_co_echo();
