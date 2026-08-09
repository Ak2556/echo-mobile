create table public.user_auras (
    id uuid default gen_random_uuid() primary key,
    user_id text references public.users(id) on delete cascade not null,
    text_content text,
    voice_url text,
    music_url text,
    privacy text check (privacy in ('public', 'mutuals', 'close_friends')) default 'mutuals',
    expires_at timestamp with time zone default (now() + interval '24 hours'),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.user_auras enable row level security;

-- Policies
create policy "Users can insert their own auras"
    on public.user_auras for insert
    with check (auth.uid()::text = user_id);

create policy "Users can update their own auras"
    on public.user_auras for update
    using (auth.uid()::text = user_id);

create policy "Users can delete their own auras"
    on public.user_auras for delete
    using (auth.uid()::text = user_id);

create policy "Auras are viewable based on privacy and expiration"
    on public.user_auras for select
    using (
        expires_at > now() and (
            user_id = auth.uid()::text 
            or privacy = 'public'
            or (privacy = 'mutuals' and exists (
                select 1 from public.follows f1
                join public.follows f2 on f1.follower_id = f2.following_id and f1.following_id = f2.follower_id
                where f1.follower_id = auth.uid()::text and f1.following_id = user_auras.user_id
            ))
        )
    );
