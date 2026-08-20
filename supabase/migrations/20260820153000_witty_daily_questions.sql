-- Clear out the old boring questions starting from today
DELETE FROM public.daily_questions WHERE active_date >= current_date;

-- Wipe the bank and insert witty, creative, thoughtful questions
TRUNCATE TABLE public.daily_question_bank;

INSERT INTO public.daily_question_bank (question, sort_order) VALUES
  ('If your search history was a psychological profile, what would the diagnosis be?', 1),
  ('What''s a hill you would absolutely die on, even if everyone thinks it''s absurd?', 2),
  ('If you could send a 5-second voice memo to yourself 10 years ago, what would you say?', 3),
  ('What is a red flag in others that is actually a green flag for you?', 4),
  ('If your brain had a "recently deleted" folder, what would be in it right now?', 5),
  ('What is the most chaotic good thing you''ve ever done?', 6),
  ('If you had to teach a college course on something completely useless, what would the syllabus look like?', 7),
  ('What''s an unwritten rule of society that you completely disagree with?', 8),
  ('If everyday tasks had a leaderboard, which one would you be in the top 1% for?', 9),
  ('What''s a completely rational fear you have that everyone else thinks is irrational?', 10),
  ('If your life was a movie, what would the critics say about the pacing of the current act?', 11),
  ('What''s a perfectly harmless word that you just absolutely despise?', 12),
  ('If you could instantly master one incredibly specific and niche skill, what would it be?', 13),
  ('What is the most bizarre coincidence that you''ve ever experienced?', 14),
  ('If you were a minor inconvenience, what would you be?', 15),
  ('What''s a piece of modern technology that still feels like actual magic to you?', 16),
  ('If you had to write a survival guide for your specific job, what''s rule number one?', 17),
  ('What''s a food combination you swear by that makes other people gag?', 18),
  ('If you could hear the soundtrack to your life, what song would be playing right now?', 19),
  ('What is the most profound thing someone has said to you completely by accident?', 20);

-- Re-backfill the next 365 days with the new questions
DO $$
DECLARE d date;
BEGIN
  FOR d IN
    SELECT generate_series(current_date, current_date + 365, interval '1 day')::date
  LOOP
    PERFORM public.ensure_daily_question(d);
  END LOOP;
END;
$$;
