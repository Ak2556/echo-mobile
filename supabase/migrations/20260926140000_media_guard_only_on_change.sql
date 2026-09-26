-- Validate media provenance when the media changes, not on every write.
--
-- guard_media_provenance() re-checks new.media_urls and new.hls_url against the
-- allowlist on every row it sees, and its trigger is
--
--     before insert or update on public.public_echoes for each row
--
-- with no column list and no comparison against `old`. So a row whose stored
-- media falls outside public.media_url_hosts cannot be written at all — not
-- just re-published, written. Everything that touches the row fails:
--
--   adjust_echo_likes_count   -> liking and unliking throw
--   the comment/repost/view counters -> same
--   adjust_salon_echo_count   -> same
--   act_on_urgent_report      -> `update public.public_echoes set
--                                check_content = false` throws, so an
--                                URGENTLY REPORTED POST CANNOT BE AUTO-HIDDEN
--
-- The last one is why this is worth a migration on its own. The failure lands
-- hardest on the safety path, and it lands silently: the caller sees a 42501
-- about media hosts while trying to like a post or hide a report.
--
-- Observed while testing something unrelated, when deleting a like raised
-- "media_urls must point at an allowed Echo media host" from inside
-- adjust_echo_likes_count.
--
-- Nothing is affected in production today: all 84 echoes currently resolve to
-- echo-mobile.at3236129.workers.dev or eyokhisijabitzjiydmz.supabase.co, both
-- allowlisted. That is the point — the allowlist is DATA, so the blast radius
-- is created by editing a table, with no deploy and no warning:
--
--   * rotating the media worker domain freezes every row referencing the old one
--   * the Tokyo -> Mumbai move would have stranded
--     eyokhisijabitzjiydmz.supabase.co and frozen every echo with
--     Supabase-hosted media, moderation included
--   * the pending video work introduces an hls_url host that does not exist yet
--
-- The security property is unchanged. A client still cannot WRITE a URL off the
-- allowlist: inserts are validated in full, and an update is validated whenever
-- it actually changes the media. What stops happening is punishing an unrelated
-- column for the state of a column nobody touched.

create or replace function public.guard_media_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url text;
begin
  -- Rejected, not silently corrected. guard_client_writes corrects columns the
  -- server owns because an honest client never writes them; here the client is
  -- supposed to supply the value, so a bad one is a mistake the caller needs
  -- told about rather than a forged field to quietly drop.
  --
  -- `is distinct from` rather than `<>` so a NULL on either side compares
  -- correctly: media_urls is nullable, and `null <> null` would be null, which
  -- would skip validation on an insert that sets it.
  if tg_op = 'INSERT' or new.media_urls is distinct from old.media_urls then
    if new.media_urls is not null then
      foreach v_url in array new.media_urls loop
        if not public.media_url_allowed(v_url) then
          raise exception
            'media_urls must point at an allowed Echo media host (got %). Upload through the media worker, or add the host to public.media_url_hosts.', v_url
            using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;

  if tg_op = 'INSERT' or new.hls_url is distinct from old.hls_url then
    if not public.media_url_allowed(new.hls_url) then
      raise exception
        'hls_url must point at an allowed Echo media host (got %).', new.hls_url
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

-- The trigger itself is deliberately left alone. Narrowing it to
-- `update of media_urls, hls_url` would also work for the counter case, but it
-- fires on the column being NAMED rather than changed, so it would still be
-- doing the comparison work in the function — and it would silently stop
-- covering any future column that needs the same treatment. The check belongs
-- where the values are.
