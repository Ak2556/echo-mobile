-- Seed 30 daily questions covering ~30 days of content from today.
-- Each prompt is hand-written to produce an answer that's interesting to
-- read from a stranger — open-ended enough to invite a real take, narrow
-- enough that "great question" isn't a valid response.
--
-- Idempotent: ON CONFLICT (active_date) DO NOTHING so re-running is safe.
-- Curators can add more rows manually or via a future cron.

insert into public.daily_questions (active_date, question) values
  (current_date,           'What''s a piece of advice you ignored that turned out to be right?'),
  (current_date + 1,       'What''s the most expensive belief you''ve changed your mind about?'),
  (current_date + 2,       'What''s something that took you embarrassingly long to learn?'),
  (current_date + 3,       'Which skill do you most envy in other people?'),
  (current_date + 4,       'What''s a hobby you''ll never tell your coworkers about?'),
  (current_date + 5,       'What''s the smallest decision that ended up reshaping your life?'),
  (current_date + 6,       'What''s a book or essay that lives rent-free in your head?'),
  (current_date + 7,       'What''s a compliment you got that you keep replaying?'),
  (current_date + 8,       'What did you believe deeply at 22 that you''d argue against today?'),
  (current_date + 9,       'What''s the kindest thing a stranger has done for you?'),
  (current_date + 10,      'What''s a controversial opinion you''d defend in a job interview?'),
  (current_date + 11,      'What''s the best money you''ve spent under $50?'),
  (current_date + 12,      'What''s a question you wish more people asked you?'),
  (current_date + 13,      'What''s an industry secret your friends would be shocked by?'),
  (current_date + 14,      'What habit changed your life that takes less than 10 minutes a day?'),
  (current_date + 15,      'What''s a song that always pulls you out of a bad mood?'),
  (current_date + 16,      'What''s a piece of fiction that taught you something real?'),
  (current_date + 17,      'What''s the most useful question you ask yourself?'),
  (current_date + 18,      'What did you outgrow in the last year?'),
  (current_date + 19,      'What''s an interview question you wish was asked more often?'),
  (current_date + 20,      'What''s a craft, sport, or art you''d start over at 80?'),
  (current_date + 21,      'What''s your most underrated personality trait?'),
  (current_date + 22,      'What''s a small ritual that anchors your week?'),
  (current_date + 23,      'What''s a piece of design — UI, object, signage — you love and never tire of?'),
  (current_date + 24,      'What''s the conversation you''d redo if you could?'),
  (current_date + 25,      'What''s a moment you knew you were no longer the same person?'),
  (current_date + 26,      'What''s a productivity rule you broke that made you more productive?'),
  (current_date + 27,      'What''s a "boring" thing you find unreasonably interesting?'),
  (current_date + 28,      'What''s the difference between who people think you are and who you are?'),
  (current_date + 29,      'What''s a future technology you''re unreasonably hopeful about?')
on conflict (active_date) do nothing;
