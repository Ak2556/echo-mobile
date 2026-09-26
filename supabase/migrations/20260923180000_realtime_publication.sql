-- Turn on the live updates the app has been asking for since it shipped.
--
-- Measured on production, 2026-09-23. The app subscribes with postgres_changes
-- to direct_messages, notifications and public_echoes. The supabase_realtime
-- publication contained exactly one table: calls. postgres_changes only fires
-- for published tables, so every one of those subscriptions has been silently
-- dead — messages, notifications and the new-posts counter never arrived live.
--
-- What the app does instead is poll: hooks/useDatabaseSync.ts runs a full sync
-- every 15 seconds while the app is open. That is 240 queries an hour per open
-- app — 2.4 million an hour at ten thousand concurrent — to discover that
-- usually nothing changed. It was also the top cost in pg_stat_statements'
-- neighbourhood: realtime's WAL decoding already runs 407,000 times for the one
-- published table, so the machinery is paid for and carries nothing useful.
--
-- direct_messages and notifications are published here. Both have row-level
-- security with policies, and realtime evaluates RLS per subscriber, so people
-- receive only rows they could already read.
--
-- public_echoes is deliberately NOT published. Every online client subscribes
-- to unfiltered INSERTs on it just to increment a "new posts" counter, so one
-- post would become one message per online client — the N×M fan-out named in
-- the scale backlog. The counter can wait for a refresh; a message cannot.
--
-- Replica identity is left at the primary key: enough to deliver inserts and
-- the new row on update, without writing the full old row into the WAL on
-- every change.

begin;

alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.notifications;

commit;
