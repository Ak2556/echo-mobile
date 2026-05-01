-- Echo: Supabase schema (run in SQL Editor or via migration CLI)
-- Requires: auth schema (built-in). Enable Anonymous sign-in in Dashboard if using anon auth.
--
-- Maintainer checklist (prod / preview):
--   - Apply repo migrations: supabase db push (see supabase/migrations/).
--   - Storage buckets `avatars` + `echo-media`: migration 20260501044859_storage_avatars_echo_media.sql
--   - Social RLS: policies below; echo_reposts / echo_views: same file as core schema + 20260502100000.
--   - ERD naming: public_echoes.likes_count (not like_count); ai_tool_calls uses args, result, status, error.
--   - User IDs: social tables reference profiles.id; AI tables (ai_*) reference auth.users.id — same UUID as profiles.id.
--
CREATE EXTENSION IF NOT EXISTS vector;

-- ── RAG / embedding log — not wired from RN yet; session_id is app-local id ──
CREATE TABLE IF NOT EXISTS rag_embedding_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rag_embedding_messages_embedding_idx ON rag_embedding_messages USING hnsw (embedding vector_cosine_ops);

-- ── Profiles (1:1 with auth.users) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    avatar_color TEXT NOT NULL DEFAULT '#3B82F6',
    avatar_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));

-- Auto-create profile row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
      'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12)
    ),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── Public echoes (feed) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_echoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    likes_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    repost_count INT NOT NULL DEFAULT 0,
    view_count INT NOT NULL DEFAULT 0,
    media_urls TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_echoes_author_idx ON public.public_echoes (author_id);
CREATE INDEX IF NOT EXISTS public_echoes_created_idx ON public.public_echoes (created_at DESC);

-- ── Likes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.echo_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    echo_id UUID NOT NULL REFERENCES public.public_echoes (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (echo_id, user_id)
);

CREATE OR REPLACE FUNCTION public.adjust_echo_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.public_echoes SET likes_count = likes_count + 1 WHERE id = NEW.echo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.public_echoes SET likes_count = greatest(0, likes_count - 1) WHERE id = OLD.echo_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_echo_like_change ON public.echo_likes;
CREATE TRIGGER on_echo_like_change
  AFTER INSERT OR DELETE ON public.echo_likes
  FOR EACH ROW EXECUTE PROCEDURE public.adjust_echo_likes_count();

-- ── Reposts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.echo_reposts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    echo_id UUID NOT NULL REFERENCES public.public_echoes (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (echo_id, user_id)
);

CREATE INDEX IF NOT EXISTS echo_reposts_echo_idx ON public.echo_reposts (echo_id);
CREATE INDEX IF NOT EXISTS echo_reposts_user_idx ON public.echo_reposts (user_id);

CREATE OR REPLACE FUNCTION public.adjust_echo_repost_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.public_echoes SET repost_count = repost_count + 1 WHERE id = NEW.echo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.public_echoes SET repost_count = greatest(0, repost_count - 1) WHERE id = OLD.echo_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_echo_repost_change ON public.echo_reposts;
CREATE TRIGGER on_echo_repost_change
  AFTER INSERT OR DELETE ON public.echo_reposts
  FOR EACH ROW EXECUTE PROCEDURE public.adjust_echo_repost_count();

-- ── Views (deduped: one increment per user per echo) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.echo_views (
    echo_id UUID NOT NULL REFERENCES public.public_echoes (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (echo_id, user_id)
);

CREATE INDEX IF NOT EXISTS echo_views_user_idx ON public.echo_views (user_id);

CREATE OR REPLACE FUNCTION public.adjust_echo_view_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.public_echoes SET view_count = view_count + 1 WHERE id = NEW.echo_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_echo_view_insert ON public.echo_views;
CREATE TRIGGER on_echo_view_insert
  AFTER INSERT ON public.echo_views
  FOR EACH ROW EXECUTE PROCEDURE public.adjust_echo_view_count();

-- ── Comments ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.echo_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    echo_id UUID NOT NULL REFERENCES public.public_echoes (id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS echo_comments_echo_idx ON public.echo_comments (echo_id, created_at);

CREATE OR REPLACE FUNCTION public.adjust_echo_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.public_echoes SET comment_count = comment_count + 1 WHERE id = NEW.echo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.public_echoes SET comment_count = greatest(0, comment_count - 1) WHERE id = OLD.echo_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_echo_comment_change ON public.echo_comments;
CREATE TRIGGER on_echo_comment_change
  AFTER INSERT OR DELETE ON public.echo_comments
  FOR EACH ROW EXECUTE PROCEDURE public.adjust_echo_comment_count();

-- ── Bookmarks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.echo_bookmarks (
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    echo_id UUID NOT NULL REFERENCES public.public_echoes (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, echo_id)
);

-- ── Follows ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
    follower_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_echoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echo_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echo_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echo_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echo_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echo_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read (public app); users update own
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Echoes: public read; insert/update/delete own
DROP POLICY IF EXISTS "Echoes are viewable by everyone" ON public.public_echoes;
CREATE POLICY "Echoes are viewable by everyone"
  ON public.public_echoes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own echoes" ON public.public_echoes;
CREATE POLICY "Users can insert own echoes"
  ON public.public_echoes FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can update own echoes" ON public.public_echoes;
CREATE POLICY "Users can update own echoes"
  ON public.public_echoes FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete own echoes" ON public.public_echoes;
CREATE POLICY "Users can delete own echoes"
  ON public.public_echoes FOR DELETE USING (auth.uid() = author_id);

-- Likes: read all; manage own rows
DROP POLICY IF EXISTS "Likes are viewable" ON public.echo_likes;
CREATE POLICY "Likes are viewable"
  ON public.echo_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own likes" ON public.echo_likes;
CREATE POLICY "Users insert own likes"
  ON public.echo_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own likes" ON public.echo_likes;
CREATE POLICY "Users delete own likes"
  ON public.echo_likes FOR DELETE USING (auth.uid() = user_id);

-- Comments: read all; insert as self; delete own
DROP POLICY IF EXISTS "Comments are viewable" ON public.echo_comments;
CREATE POLICY "Comments are viewable"
  ON public.echo_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own comments" ON public.echo_comments;
CREATE POLICY "Users insert own comments"
  ON public.echo_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users delete own comments" ON public.echo_comments;
CREATE POLICY "Users delete own comments"
  ON public.echo_comments FOR DELETE USING (auth.uid() = author_id);

-- Bookmarks: read own; insert/delete own
DROP POLICY IF EXISTS "Users view own bookmarks" ON public.echo_bookmarks;
CREATE POLICY "Users view own bookmarks"
  ON public.echo_bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own bookmarks" ON public.echo_bookmarks;
CREATE POLICY "Users insert own bookmarks"
  ON public.echo_bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own bookmarks" ON public.echo_bookmarks;
CREATE POLICY "Users delete own bookmarks"
  ON public.echo_bookmarks FOR DELETE USING (auth.uid() = user_id);

-- Reposts: read all; manage own rows
DROP POLICY IF EXISTS "Reposts are viewable" ON public.echo_reposts;
CREATE POLICY "Reposts are viewable"
  ON public.echo_reposts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own reposts" ON public.echo_reposts;
CREATE POLICY "Users insert own reposts"
  ON public.echo_reposts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own reposts" ON public.echo_reposts;
CREATE POLICY "Users delete own reposts"
  ON public.echo_reposts FOR DELETE USING (auth.uid() = user_id);

-- Echo views: insert own; read own rows only
DROP POLICY IF EXISTS "Users insert own echo views" ON public.echo_views;
CREATE POLICY "Users insert own echo views"
  ON public.echo_views FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own echo_views rows" ON public.echo_views;
CREATE POLICY "Users view own echo_views rows"
  ON public.echo_views FOR SELECT USING (auth.uid() = user_id);

-- Follows: read all; manage own follower_id rows
DROP POLICY IF EXISTS "Follows are viewable" ON public.follows;
CREATE POLICY "Follows are viewable"
  ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own follows" ON public.follows;
CREATE POLICY "Users insert own follows"
  ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users delete own follows" ON public.follows;
CREATE POLICY "Users delete own follows"
  ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Optional: allow Discover without session (Expo public feed) — uses anon key without sign-in
DROP POLICY IF EXISTS "Anon can read echoes" ON public.public_echoes;
CREATE POLICY "Anon can read echoes"
  ON public.public_echoes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read profiles" ON public.profiles;
CREATE POLICY "Anon can read profiles"
  ON public.profiles FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read comments" ON public.echo_comments;
CREATE POLICY "Anon can read comments"
  ON public.echo_comments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read likes" ON public.echo_likes;
CREATE POLICY "Anon can read likes"
  ON public.echo_likes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read follows" ON public.follows;
CREATE POLICY "Anon can read follows"
  ON public.follows FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can read reposts" ON public.echo_reposts;
CREATE POLICY "Anon can read reposts"
  ON public.echo_reposts FOR SELECT TO anon USING (true);
