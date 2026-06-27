-- DSA Art. 20: moderator role on profiles + RLS for appeals review queue.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

-- Moderators can read all appeals (pending + resolved) for the review queue.
DROP POLICY IF EXISTS "moderators read all appeals" ON public.appeals;
CREATE POLICY "moderators read all appeals" ON public.appeals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_moderator = true)
  );

-- Moderators can update (resolve) any appeal.
DROP POLICY IF EXISTS "moderators update appeals" ON public.appeals;
CREATE POLICY "moderators update appeals" ON public.appeals
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_moderator = true)
  );
