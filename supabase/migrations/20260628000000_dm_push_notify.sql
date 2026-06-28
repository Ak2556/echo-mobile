-- DM push notifications: trigger on direct_messages inserts a notifications row,
-- which chains into the existing trg_notifications_push_fanout → push-fanout Edge Function.
-- The tap handler in app/_layout.tsx already routes kind='dm' → /messages/[id].

CREATE OR REPLACE FUNCTION public.fn_dm_push_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient_id uuid;
  v_preview      text;
BEGIN
  -- Determine the recipient: the other participant in the conversation.
  SELECT CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
  INTO v_recipient_id
  FROM public.dm_conversations
  WHERE id = NEW.conversation_id;

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_preview := CASE NEW.kind
    WHEN 'image' THEN '📷 Photo'
    WHEN 'voice' THEN '🎙️ Voice message'
    WHEN 'echo'  THEN '💬 Shared an Echo'
    ELSE LEFT(COALESCE(NEW.content, ''), 140)
  END;

  -- Insert triggers trg_notifications_push_fanout, which calls the Edge Function.
  INSERT INTO public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  VALUES (v_recipient_id, 'dm', NEW.sender_id, NEW.conversation_id, 'dm_conversation', v_preview);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the message insert on a notification failure.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_push_notify ON public.direct_messages;
CREATE TRIGGER trg_dm_push_notify
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_dm_push_notify();
