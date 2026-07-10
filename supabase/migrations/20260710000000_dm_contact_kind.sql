-- The contact-share DM feature inserts kind='contact', but the
-- direct_messages.kind check constraint (20260502140000) predates it and
-- only allows text/image/voice/echo/link — every contact share would fail
-- the constraint. Extend it.

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_kind_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_kind_check
  CHECK (kind IN ('text', 'image', 'voice', 'echo', 'link', 'contact'));
