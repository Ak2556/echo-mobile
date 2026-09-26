-- Bound the remix tree's breadth, not just its depth.
--
-- get_remix_tree stops at eight levels, which bounds how deep a thread can go
-- and says nothing about how wide. One post that many people remix returns
-- every remix, and every remix of those, up to eight levels — a response whose
-- size is set by how popular the post got. It is the last feed-shaped query in
-- the schema with no limit on its output.
--
-- Two guards, both matching what the screen can actually show:
--
--   * 200 rows. A remix tree is read by scrolling a thread, and nobody scrolls
--     past two hundred nodes. The cap is applied after ordering, so what is
--     kept is the top of the tree by depth and engagement, which is what the
--     screen renders first anyway.
--
--   * The same ordering decides what survives the cap, so the result is
--     deterministic rather than whatever the planner emitted first.
--
-- Depth stays at eight. Nothing else about the shape changes.

begin;

create or replace function public.get_remix_tree(p_root_id uuid)
returns table(id uuid, parent_echo_id uuid, depth integer, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, remix_count integer, perspective_type text, perspective_note text, source_url text, created_at timestamp with time zone, media_urls text[], username text, display_name text, avatar_color text, avatar_url text, is_verified boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  with recursive lineage as (
    select e.*, 0 as depth
      from public.visible_echoes e
     where e.id = p_root_id
       and e.check_content = true
    union all
    select e.*, l.depth + 1
      from public.visible_echoes e
      join lineage l on e.parent_echo_id = l.id
     where l.depth < 8
       and e.check_content = true
  )
  select
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    case when l.parent_echo_id is null then null else coalesce(l.perspective_type, 'reframe') end,
    l.perspective_note,
    l.source_url,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  from lineage l
  join public.profiles p on p.id = l.author_id
  order by l.depth asc,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) desc,
           l.created_at desc
  limit 200;
$function$;

commit;
