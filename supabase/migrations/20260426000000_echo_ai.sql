-- Echo AI: conversations, messages, and tool-call audit log.
-- One row per chat thread; messages and tool calls cascade.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  tool_name text,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conv_idx
  on public.ai_messages(conversation_id, created_at);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.ai_messages(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  result jsonb,
  status text not null default 'executed' check (status in ('pending_confirm','executed','rejected','failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_tool_calls_user_idx
  on public.ai_tool_calls(user_id, created_at desc);

-- Touch updated_at on the parent conversation when a new message arrives.
create or replace function public.ai_touch_conversation()
returns trigger language plpgsql as $$
begin
  update public.ai_conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists ai_messages_touch on public.ai_messages;
create trigger ai_messages_touch
  after insert on public.ai_messages
  for each row execute function public.ai_touch_conversation();

-- RLS: every row is scoped to the owning user.
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_calls enable row level security;

drop policy if exists ai_conv_owner on public.ai_conversations;
create policy ai_conv_owner on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ai_msg_owner on public.ai_messages;
create policy ai_msg_owner on public.ai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ai_tool_owner on public.ai_tool_calls;
create policy ai_tool_owner on public.ai_tool_calls
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
