-- Add music columns to echoes and user_auras
alter table public.public_echoes 
add column if not exists music_title text,
add column if not exists music_artist text,
add column if not exists music_url text;

alter table public.user_auras 
add column if not exists music_title text,
add column if not exists music_artist text;
