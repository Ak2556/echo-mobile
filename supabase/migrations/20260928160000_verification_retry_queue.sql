-- Identity verification: retry a request the model could not judge.
--
-- When the vision model was unavailable at submit time, the request was left
-- pending "for human review" and nothing tried again: it waited until a
-- moderator happened to open the queue. verify-identity now enqueues a
-- 'verification' job instead; the worker retries it with backoff, and after
-- the last attempt it is dead-lettered (and reported) while staying in the
-- moderators' pending list.
--
-- Edge functions enqueue through jobs_enqueue with the service role, which is
-- already trusted with every table this touches.

begin;

select pgmq.create('verification');

grant execute on function public.jobs_enqueue(text, jsonb, integer) to service_role;

commit;
