-- Let a learner delete their account without breaking their tutor's bookings.
--
-- learn_bookings.learner_id is `on delete set null`, so erasing a learner
-- anonymises their past bookings rather than destroying the tutor's record of
-- sessions that really happened. But learn_bookings_has_party required a
-- learner *or* a guest on every row, and a CHECK applies to updates as well as
-- inserts — so the FK's own SET NULL violated it, and `delete from auth.users`
-- failed outright. Account deletion is not optional (delete_account RPC, DSA
-- Art. 17), so this had to give.
--
-- The invariant is really about creation: you cannot book a session for nobody.
-- Enforcing it in a BEFORE INSERT trigger says exactly that, and leaves a row
-- whose learner has since erased themselves alone.

alter table public.learn_bookings drop constraint if exists learn_bookings_has_party;

create or replace function public.fn_learn_booking_requires_party()
returns trigger
language plpgsql
as $function$
begin
  if new.learner_id is null and (new.guest_name is null or new.guest_token is null) then
    raise exception 'a booking needs either a learner or a named guest with a token'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_learn_booking_requires_party on public.learn_bookings;
create trigger trg_learn_booking_requires_party
  before insert on public.learn_bookings
  for each row execute function public.fn_learn_booking_requires_party();
