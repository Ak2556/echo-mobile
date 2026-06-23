-- Messaging Upgrade
-- Adds: denormalized last-message columns + trigger, UPDATE RLS on conversations,
--       soft-delete on messages, message_reactions table, and get_dm_conversations RPC.

-- 1. Denormalized columns on dm_conversations (single fast read per conversation)
ALTER TABLE public.dm_conversations
  ADD COLUMN IF NOT EXISTS last_message_text text,
  ADD COLUMN IF NOT EXISTS last_message_kind text DEFAULT 'text';

-- 2. UPDATE RLS on dm_conversations (required for client + trigger to update it)
DROP POLICY IF EXISTS "dm_conv_update_participants" ON public.dm_conversations;
CREATE POLICY "dm_conv_update_participants" ON public.dm_conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- 3. Trigger: keep last_message_text / last_message_at in sync on every INSERT
CREATE OR REPLACE FUNCTION public.fn_sync_conv_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE dm_conversations
     SET last_message_at   = NEW.created_at,
         last_message_text = CASE NEW.kind
                               WHEN 'echo'  THEN 'Shared an Echo'
                               WHEN 'image' THEN 'Photo'
                               WHEN 'voice' THEN 'Voice message'
                               ELSE NEW.text
                             END,
         last_message_kind = NEW.kind
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conv_last_message ON public.direct_messages;
CREATE TRIGGER trg_conv_last_message
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_conv_last_message();

-- 4. Soft-delete: sender can hide their own messages
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 5. Message reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text        NOT NULL CHECK (length(emoji) <= 10),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "react_select" ON public.message_reactions;
CREATE POLICY "react_select" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM public.direct_messages dm
        JOIN public.dm_conversations dc ON dc.id = dm.conversation_id
       WHERE dm.id = message_reactions.message_id
         AND (dc.user_a = auth.uid() OR dc.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "react_insert" ON public.message_reactions;
CREATE POLICY "react_insert" ON public.message_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "react_delete" ON public.message_reactions;
CREATE POLICY "react_delete" ON public.message_reactions
  FOR DELETE USING (user_id = auth.uid());

-- 6. RPC: fetch conversations with correct last message + real unread count (one round-trip)
DROP FUNCTION IF EXISTS public.get_dm_conversations(uuid);
CREATE OR REPLACE FUNCTION public.get_dm_conversations(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  id                  uuid,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_color  text,
  last_message_at     timestamptz,
  last_message_text   text,
  last_message_kind   text,
  unread_count        bigint
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    dc.id,
    CASE WHEN dc.user_a = p_user_id THEN dc.user_b ELSE dc.user_a END AS other_user_id,
    p.username        AS other_username,
    p.display_name    AS other_display_name,
    p.avatar_color    AS other_avatar_color,
    dc.last_message_at,
    dc.last_message_text,
    dc.last_message_kind,
    (
      SELECT COUNT(*)
        FROM direct_messages dm
       WHERE dm.conversation_id = dc.id
         AND dm.sender_id       != p_user_id
         AND dm.read_at         IS NULL
         AND dm.deleted_at      IS NULL
    ) AS unread_count
  FROM dm_conversations dc
  JOIN profiles p
    ON p.id = CASE WHEN dc.user_a = p_user_id THEN dc.user_b ELSE dc.user_a END
  WHERE dc.user_a = p_user_id OR dc.user_b = p_user_id
  ORDER BY dc.last_message_at DESC NULLS LAST
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_dm_conversations(uuid) TO authenticated;
