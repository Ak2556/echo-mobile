-- Per-user conversation preferences: mute (no push) and archive (hidden from
-- the main inbox). One row per (conversation, user); absence = defaults.

create table if not exists public.dm_prefs (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  muted           boolean not null default false,
  archived        boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.dm_prefs enable row level security;

create policy "own dm prefs — select"
  on public.dm_prefs for select using (auth.uid() = user_id);
create policy "own dm prefs — insert"
  on public.dm_prefs for insert with check (auth.uid() = user_id);
create policy "own dm prefs — update"
  on public.dm_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own dm prefs — delete"
  on public.dm_prefs for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.dm_prefs to authenticated;

-- Push notifications respect mute: same function as 20260628000000 plus the
-- dm_prefs guard — and a FIX: the original read NEW.content, but the column
-- on direct_messages is `text`. plpgsql raises on the missing record field at
-- runtime, which aborted every text-DM insert since the trigger shipped.
CREATE OR REPLACE FUNCTION public.fn_dm_push_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient_id uuid;
  v_preview      text;
BEGIN
  SELECT CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
  INTO v_recipient_id
  FROM public.dm_conversations
  WHERE id = NEW.conversation_id;

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  -- Recipient muted this conversation — no notification row, no push.
  IF EXISTS (
    SELECT 1 FROM public.dm_prefs
    WHERE conversation_id = NEW.conversation_id
      AND user_id = v_recipient_id
      AND muted = true
  ) THEN
    RETURN NEW;
  END IF;

  v_preview := CASE NEW.kind
    WHEN 'image' THEN '📷 Photo'
    WHEN 'voice' THEN '🎙️ Voice message'
    WHEN 'echo'  THEN '💬 Shared an Echo'
    ELSE LEFT(COALESCE(NEW.text, ''), 140)
  END;

  INSERT INTO public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  VALUES (v_recipient_id, 'dm', NEW.sender_id, NEW.conversation_id, 'dm_conversation', v_preview);

  RETURN NEW;
END;
$$;
