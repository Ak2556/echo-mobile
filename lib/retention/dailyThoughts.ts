// A curated pool of daily reflective thoughts for the Home "Thought for today"
// card. One is surfaced per calendar day. The pick is a pure function of the
// calendar day, so every device shows the same thought on the same day and none
// repeats until the whole pool has been shown (see pickThought). The store still
// pins the day's pick, so it also survives re-renders and app restarts.
//
// The pool is APPEND-ONLY: a thought's id is persisted on devices (the pinned
// pick and the seen list), so never rename or remove one. Adding thoughts changes
// the day-to-thought mapping from that point on.

export type Thought = { id: string; text: string; tags: ThemeTag[] };

export type ThemeTag =
  | 'general'
  | 'growth'
  | 'mind'
  | 'creativity'
  | 'work'
  | 'money'
  | 'health'
  | 'learning'
  | 'relationships';

// Compact constructor for the numbered entries below.
const th = (id: string, text: string, ...tags: ThemeTag[]): Thought => ({ id, text, tags });

export const DAILY_THOUGHTS: Thought[] = [
  { id: 'defend-loudest', text: 'The opinion you defend the loudest is often the one you’ve examined the least.', tags: ['mind', 'growth'] },
  { id: 'outgrow', text: 'You’re allowed to outgrow the person you were last year.', tags: ['growth', 'general'] },
  { id: 'change-mind-upgrade', text: 'Changing your mind isn’t losing an argument — it’s winning an upgrade.', tags: ['mind', 'growth'] },
  { id: 'certainty-habit', text: 'Most of what you call certainty is just a habit you haven’t questioned yet.', tags: ['mind'] },
  { id: 'quiet-honest', text: 'The quietest thoughts are usually the honest ones.', tags: ['mind', 'general'] },
  { id: 'every-argument', text: 'You don’t have to attend every argument you’re invited to.', tags: ['relationships', 'mind'] },
  { id: 'curiosity-ages', text: 'Curiosity ages better than being right.', tags: ['learning', 'growth'] },
  { id: 'notice-trend', text: 'What you notice today, you were blind to a year ago. Trust the trend.', tags: ['growth'] },
  { id: 'rent-belief', text: 'A belief you can’t explain simply is one you’re renting, not owning.', tags: ['mind', 'learning'] },
  { id: 'better-word', text: 'The goal isn’t to have the last word. It’s to have a better one.', tags: ['mind', 'creativity'] },
  { id: 'loosely-held', text: 'Strong opinions, loosely held, travel further than certainty.', tags: ['work', 'mind'] },
  { id: 'beginner-refused', text: 'Every expert was once a beginner who refused to stop.', tags: ['learning', 'growth'] },
  { id: 'future-watching', text: 'Your future self is watching how you think today.', tags: ['growth', 'general'] },
  { id: 'doubt-conviction', text: 'Doubt isn’t the opposite of conviction — it’s how conviction earns its keep.', tags: ['mind'] },
  { id: 'better-question', text: 'The world rewards the person who asks the better question.', tags: ['work', 'learning'] },
  { id: 'committed-open', text: 'You can be deeply committed and still stay open. That’s maturity.', tags: ['growth', 'relationships'] },
  { id: 'silence-answer', text: 'Silence is also an answer — sometimes the wisest one.', tags: ['mind', 'relationships'] },
  { id: 'compound-thoughts', text: 'Small consistent thoughts compound into who you become.', tags: ['growth', 'health'] },
  { id: 'less-wrong', text: 'Being wrong on purpose, briefly, is how you get less wrong forever.', tags: ['learning', 'mind'] },
  { id: 'map-territory', text: 'The map in your head isn’t the territory. Update it often.', tags: ['mind', 'learning'] },
  { id: 'almost-dismissed', text: 'You learn the most from the idea you almost dismissed.', tags: ['learning', 'creativity'] },
  { id: 'comparison-steals', text: 'Comparison steals today; reflection returns it.', tags: ['health', 'growth'] },
  { id: 'mirror-honest', text: 'The hardest person to be honest with is the one in the mirror.', tags: ['growth', 'mind'] },
  { id: 'boring-days', text: 'Progress hides in the boring days. Show up anyway.', tags: ['work', 'health'] },
  { id: 'borrowed-noise', text: 'An unexamined opinion is just borrowed noise.', tags: ['mind'] },
  { id: 'after-reaction', text: 'You’re not your first reaction. You’re what you do after it.', tags: ['growth', 'relationships'] },
  { id: 'past-grace', text: 'Give your past self grace — they were working with less.', tags: ['growth', 'general'] },
  { id: 'change-public', text: 'The best thinkers change their minds in public.', tags: ['mind', 'work'] },
  { id: 'understand-disagree', text: 'Understanding someone you disagree with is a superpower, not a betrayal.', tags: ['relationships', 'mind'] },
  { id: 'fresh-page', text: 'Today is a fresh page. Write one honest line.', tags: ['creativity', 'general'] },
  { id: 'depth-over-speed', text: 'Depth is just attention that refused to move on.', tags: ['learning', 'creativity'] },
  { id: 'rest-part', text: 'Rest isn’t the reward for the work. It’s part of it.', tags: ['health', 'work'] },
  { id: 'spend-attention', text: 'You become what you spend your attention on. Spend it well.', tags: ['growth', 'health'] },
  { id: 'invest-patience', text: 'The best returns come to the patience most people can’t hold.', tags: ['money', 'growth'] },
  { id: 'build-small', text: 'Build something small today that your future self can stand on.', tags: ['work', 'creativity'] },
  { id: 'listen-more', text: 'You’ll never learn the thing you already assume you know.', tags: ['learning', 'relationships'] },

  // growth
  th('growth-01', 'Progress rarely announces itself. It looks like an ordinary Tuesday.', 'growth'),
  th('growth-02', 'What you repeat quietly becomes what you are loudly.', 'growth'),
  th('growth-03', 'Be a little kinder to the version of you who is still learning this.', 'growth'),
  th('growth-04', 'Start before you feel ready. Readiness shows up somewhere in the middle.', 'growth'),
  th('growth-05', 'Discipline is a promise you keep when nobody is checking.', 'growth'),
  th('growth-06', 'One honest hour beats a week of good intentions.', 'growth', 'work'),
  th('growth-07', 'You’re not behind. You’re on a path no one else has walked.', 'growth', 'general'),
  th('growth-08', 'Growth often feels like confusion wearing a new coat.', 'growth', 'mind'),
  th('growth-09', 'The habit you build today is a gift your tired self will open later.', 'growth', 'health'),
  th('growth-10', 'Every “not yet” is still a direction.', 'growth'),
  th('growth-11', 'Ask what you’d do if you trusted yourself a little more.', 'growth', 'mind'),
  th('growth-12', 'Small courage, repeated, is still courage.', 'growth'),
  th('growth-13', 'Today’s discomfort is tomorrow’s ordinary.', 'growth'),
  th('growth-14', 'You don’t need a new life. You need a slightly better Tuesday, repeated.', 'growth', 'general'),
  th('growth-15', 'Make the next step so small it’s embarrassing not to take it.', 'growth', 'work'),
  th('growth-16', 'Choose the version of today you’d be proud to repeat.', 'growth'),
  th('growth-17', 'Failing at something new beats succeeding at something stale.', 'growth', 'learning'),
  th('growth-18', 'You’re allowed to want more without being ungrateful for what you have.', 'growth', 'general'),
  th('growth-19', 'Slow growth is still growth. Roots don’t apologize for staying underground.', 'growth'),
  th('growth-20', 'The person you’re becoming is made of what you do when it’s inconvenient.', 'growth'),
  th('growth-21', 'Let yesterday’s mistake be a teacher, not a landlord.', 'growth', 'learning'),
  th('growth-22', 'Finish the small thing. Momentum is built from finished things.', 'growth', 'work'),
  th('growth-23', 'Don’t wait for motivation. Show up and let it catch up with you.', 'growth'),
  th('growth-24', 'Pick one thing to be bad at, on purpose, this week.', 'growth', 'learning'),
  th('growth-25', 'You can’t think your way into confidence. You act your way there.', 'growth', 'mind'),
  th('growth-26', 'The gap between who you are and who you want to be closes in small, daily minutes.', 'growth'),
  th('growth-27', 'Consistency is quietly more impressive than intensity.', 'growth', 'work'),
  th('growth-28', 'Name the fear. It shrinks once it has a name tag.', 'growth', 'mind'),
  th('growth-29', 'Do the thing today that future you will thank you for.', 'growth'),
  th('growth-30', 'Growth is mostly subtraction: fewer excuses, fewer distractions, fewer pretences.', 'growth'),

  // mind
  th('mind-01', 'Not every thought you have deserves your belief.', 'mind'),
  th('mind-02', 'Attention is the one thing you spend every day, budget or not.', 'mind', 'growth'),
  th('mind-03', 'A calm mind isn’t an empty one. It’s one that stopped arguing with itself.', 'mind', 'health'),
  th('mind-04', 'You can watch a worry without following it home.', 'mind', 'health'),
  th('mind-05', 'The story you tell about today shapes tomorrow more than today does.', 'mind'),
  th('mind-06', 'Overthinking is fear wearing a clever outfit.', 'mind'),
  th('mind-07', 'Sit with the question a little longer before you reach for the answer.', 'mind', 'learning'),
  th('mind-08', 'Your mood is weather, not climate. Don’t move house over one storm.', 'mind', 'health'),
  th('mind-09', 'Notice the thought before it starts steering.', 'mind'),
  th('mind-10', 'Clarity often arrives once you stop forcing it.', 'mind'),
  th('mind-11', 'What you resist keeps your attention. What you allow can finally pass.', 'mind', 'health'),
  th('mind-12', 'Not knowing is a perfectly good place to stand for a while.', 'mind', 'general'),
  th('mind-13', 'Thoughts are visitors. You don’t have to serve them dinner.', 'mind'),
  th('mind-14', 'The mind loves a conclusion. Give it a question instead.', 'mind', 'learning'),
  th('mind-15', 'Slow down enough to hear what you actually think.', 'mind'),
  th('mind-16', 'The loudest voice in your head is rarely the wisest one.', 'mind'),
  th('mind-17', 'You can’t stop the wave, but you can notice you’re surfing.', 'mind', 'general'),
  th('mind-18', 'Rumination feels like problem-solving and delivers none of it.', 'mind', 'health'),
  th('mind-19', 'A pause is a very small meditation.', 'mind', 'health'),
  th('mind-20', 'Be as curious about your reactions as you would be about a friend’s.', 'mind', 'relationships'),
  th('mind-21', 'Peace isn’t the absence of noise. It’s a quiet place you can still find inside it.', 'mind', 'general'),
  th('mind-22', 'Your first answer is a draft. Let the second one be honest.', 'mind', 'creativity'),
  th('mind-23', 'Name what you feel and half the weight moves.', 'mind', 'health'),
  th('mind-24', 'Not every silence needs filling, least of all the one inside you.', 'mind'),
  th('mind-25', 'Perspective is a muscle. Step back until the problem fits in your hand.', 'mind', 'growth'),
  th('mind-26', 'Think about the thing you keep avoiding thinking about.', 'mind', 'growth'),
  th('mind-27', 'Ask what this would look like if it were easy.', 'mind', 'work'),
  th('mind-28', 'Today’s certainty is tomorrow’s curiosity.', 'mind', 'learning'),
  th('mind-29', 'You’re the one person you can’t leave the room on.', 'mind', 'growth'),
  th('mind-30', 'A mind at rest sees further than a mind in a hurry.', 'mind'),

  // creativity
  th('creativity-01', 'Make it badly first. Perfect is a second draft’s job.', 'creativity'),
  th('creativity-02', 'Every idea starts as an awkward whisper.', 'creativity'),
  th('creativity-03', 'Boredom is where good ideas come to stretch.', 'creativity', 'mind'),
  th('creativity-04', 'Copy to learn, then change one thing until it becomes yours.', 'creativity', 'learning'),
  th('creativity-05', 'Don’t wait for inspiration. Leave the door open and keep working.', 'creativity', 'work'),
  th('creativity-06', 'A blank page is an invitation, not an accusation.', 'creativity'),
  th('creativity-07', 'The sketch that scares you is the one worth finishing.', 'creativity', 'growth'),
  th('creativity-08', 'Creativity is noticing slightly more than you did yesterday.', 'creativity', 'mind'),
  th('creativity-09', 'Say the odd thing. Someone out there has been waiting to hear it.', 'creativity', 'relationships'),
  th('creativity-10', 'Constraints are a creative gift. Give yourself fewer options today.', 'creativity', 'work'),
  th('creativity-11', 'Let it be strange for a minute before you make it sensible.', 'creativity'),
  th('creativity-12', 'Your voice isn’t found. It’s accumulated, one honest attempt at a time.', 'creativity', 'growth'),
  th('creativity-13', 'Share the unfinished version. Finished is a rumour.', 'creativity', 'work'),
  th('creativity-14', 'Play first. The work will forgive you later.', 'creativity', 'general'),
  th('creativity-15', 'A good idea is a question you haven’t finished asking.', 'creativity', 'learning'),
  th('creativity-16', 'Take a walk with no destination and see what follows you home.', 'creativity', 'health'),
  th('creativity-17', 'Make something for one person and it often reaches more.', 'creativity', 'relationships'),
  th('creativity-18', 'Rough edges are where people can hold on.', 'creativity'),
  th('creativity-19', 'Notice what you can’t stop looking at. That’s a clue.', 'creativity', 'mind'),
  th('creativity-20', 'Ten bad ideas are the toll you pay for one good one.', 'creativity'),
  th('creativity-21', 'Make room for the thing that has no use yet.', 'creativity', 'general'),
  th('creativity-22', 'Skill gets you in the room. Taste decides what you do there.', 'creativity', 'work'),
  th('creativity-23', 'Don’t polish the first line so long that you forget the last.', 'creativity', 'work'),
  th('creativity-24', 'Describe one small thing so well that it becomes true for everyone.', 'creativity'),
  th('creativity-25', 'Let curiosity pick the project, not the schedule.', 'creativity', 'learning'),
  th('creativity-26', 'A few honest words in a day still count as writing.', 'creativity', 'growth'),
  th('creativity-27', 'Make the thing you wish already existed.', 'creativity', 'work'),
  th('creativity-28', 'The best ideas arrive when your hands are busy and your mind isn’t.', 'creativity', 'mind'),
  th('creativity-29', 'Today, make one thing nobody asked for.', 'creativity'),
  th('creativity-30', 'Trust the strange spark. It rarely returns at a convenient time.', 'creativity'),

  // work
  th('work-01', 'Do the hard thing first. The rest of the day gets lighter to carry.', 'work'),
  th('work-02', 'Busy is a feeling. Done is a fact.', 'work'),
  th('work-03', 'A clear no today saves a messy yes tomorrow.', 'work', 'relationships'),
  th('work-04', 'Write down the one thing that would make today a success.', 'work', 'growth'),
  th('work-05', 'Good work is often just careful attention, repeated.', 'work', 'mind'),
  th('work-06', 'Ask for feedback while the thing can still change.', 'work', 'learning'),
  th('work-07', 'Meetings expand and focus shrinks. Protect one hour.', 'work'),
  th('work-08', 'Ship it, then make it better. Waiting is a decision too.', 'work', 'creativity'),
  th('work-09', 'Teach what you’ve just learned. It will stick twice as long.', 'work', 'learning'),
  th('work-10', 'Say what you’re working on out loud. Vague plans are hard to keep.', 'work', 'relationships'),
  th('work-11', 'The work you’re avoiding is usually the work that matters.', 'work', 'growth'),
  th('work-12', 'One careful message beats five rushed ones.', 'work', 'relationships'),
  th('work-13', 'Small improvements, made daily, are invisible and unstoppable.', 'work', 'growth'),
  th('work-14', 'Your reputation is built in the details no one is checking.', 'work'),
  th('work-15', 'If it takes two minutes, do it now and clear the space.', 'work'),
  th('work-16', 'Take the unglamorous task seriously and the glamorous ones will follow.', 'work', 'growth'),
  th('work-17', 'A deadline is a gift to the indecisive.', 'work'),
  th('work-18', 'Don’t confuse being available with being useful.', 'work'),
  th('work-19', 'Know when good enough is the best option on the table.', 'work', 'mind'),
  th('work-20', 'Thank the person whose work made yours possible.', 'work', 'relationships'),
  th('work-21', 'When you’re stuck, make the problem smaller instead of yourself.', 'work', 'mind'),
  th('work-22', 'Leave your workspace a little better than you found it.', 'work', 'general'),
  th('work-23', 'Disagree early. Commit fully.', 'work', 'relationships'),
  th('work-24', 'Work with people who tell you the truth gently.', 'work', 'relationships'),
  th('work-25', 'A plan is a conversation with the future. Revisit it.', 'work', 'mind'),
  th('work-26', 'Energy is the real calendar. Schedule around it.', 'work', 'health'),
  th('work-27', 'Do fewer things, but finish them as if someone you respect will read them.', 'work'),
  th('work-28', 'Mistakes you share early cost less than mistakes you hide.', 'work', 'learning'),
  th('work-29', 'Be the person who makes the next step obvious for others.', 'work', 'relationships'),
  th('work-30', 'End the day by naming what you’ll start with tomorrow.', 'work', 'growth'),

  // money
  th('money-01', 'Spend on what you’ll still value when the novelty fades.', 'money'),
  th('money-02', 'Pay yourself first, even if first is small.', 'money', 'growth'),
  th('money-03', 'Knowing what you owe is the beginning of being free of it.', 'money'),
  th('money-04', 'Wealth is often just calm that compounds.', 'money', 'mind'),
  th('money-05', 'Don’t buy what you can’t explain to your future self.', 'money', 'mind'),
  th('money-06', 'Little leaks sink big ships. Check the small subscriptions.', 'money'),
  th('money-07', 'Saving is a quiet way of telling your future you care.', 'money', 'growth'),
  th('money-08', 'Price is what you pay. Value is what you keep.', 'money'),
  th('money-09', 'Patience is a financial skill, and it’s free.', 'money', 'growth'),
  th('money-10', 'A budget isn’t a cage. It’s a map of what you actually care about.', 'money', 'mind'),
  th('money-11', 'Enough is a number worth deciding in advance.', 'money', 'mind'),
  th('money-12', 'Be generous on purpose, not by accident.', 'money', 'relationships'),
  th('money-13', 'Urgency is a salesperson’s favourite tool. Wait a day.', 'money', 'mind'),
  th('money-14', 'Learn one money idea this week and use it once.', 'money', 'learning'),
  th('money-15', 'Earning more helps, but wanting less helps sooner.', 'money', 'mind'),
  th('money-16', 'Compare your finances to your plan, not to other people’s photos.', 'money', 'health'),
  th('money-17', 'Track your spending for a month and let the truth surprise you.', 'money', 'learning'),
  th('money-18', 'An emergency fund is a promise that bad days won’t become bad years.', 'money'),
  th('money-19', 'Don’t confuse looking rich with being secure.', 'money'),
  th('money-20', 'Invest in skills. They can’t be repossessed.', 'money', 'learning', 'work'),
  th('money-21', 'Debt is borrowed time. Pay it back kindly and steadily.', 'money'),
  th('money-22', 'Ask what an expense costs in hours of your life.', 'money', 'mind'),
  th('money-23', 'Let the boring habit do the work: same amount, same day.', 'money', 'growth'),
  th('money-24', 'Negotiating is just asking, with preparation.', 'money', 'work'),
  th('money-25', 'Teach someone close to you one thing about money.', 'money', 'relationships'),
  th('money-26', 'Don’t let a good deal turn into a bad purchase.', 'money'),
  th('money-27', 'The best investment is often whatever gives you time back.', 'money', 'health'),
  th('money-28', 'Be careful with advice from anyone who gains if you follow it.', 'money', 'mind'),
  th('money-29', 'Money is a tool. Decide what you’re building before you buy the hammer.', 'money', 'work'),
  th('money-30', 'Gratitude is the cheapest upgrade available.', 'money', 'general'),

  // health
  th('health-01', 'Drink some water. Your mood will thank you before your skin does.', 'health'),
  th('health-02', 'A ten-minute walk is a small argument against a heavy day.', 'health', 'mind'),
  th('health-03', 'Sleep is not a luxury. It’s maintenance.', 'health'),
  th('health-04', 'Stretch the way you’d stretch for a friend who’s been sitting all day.', 'health', 'relationships'),
  th('health-05', 'Your body keeps a record of how you’ve treated it. Write something kind.', 'health'),
  th('health-06', 'Eat something that grew, and notice that you’re eating it.', 'health', 'mind'),
  th('health-07', 'Rest before you’re forced to.', 'health', 'work'),
  th('health-08', 'You may not be lazy. You may simply be tired.', 'health', 'mind'),
  th('health-09', 'Breathe out slowly. It’s the cheapest reset there is.', 'health', 'mind'),
  th('health-10', 'Move for the joy of moving, not the number on the screen.', 'health'),
  th('health-11', 'Put the phone down fifteen minutes before sleep and see what returns.', 'health', 'mind'),
  th('health-12', 'Strength is built on the rest days too.', 'health', 'growth'),
  th('health-13', 'Look at something far away. Your eyes and your thoughts will both unclench.', 'health', 'mind'),
  th('health-14', 'Habits are easier to keep when they’re easy to start.', 'health', 'growth'),
  th('health-15', 'Take the stairs, call it a victory, and move on.', 'health', 'general'),
  th('health-16', 'Healthy isn’t perfect. It’s a lot of ordinary good choices.', 'health', 'growth'),
  th('health-17', 'Sunlight is free medicine. Take a little this morning.', 'health', 'general'),
  th('health-18', 'Listen when your body whispers so it doesn’t have to shout.', 'health', 'mind'),
  th('health-19', 'Cook one meal for yourself with the care you’d give a guest.', 'health', 'relationships'),
  th('health-20', 'Notice where you’re holding tension. Drop your shoulders.', 'health', 'mind'),
  th('health-21', 'Aim for steady, not heroic. Heroic burns out.', 'health', 'work'),
  th('health-22', 'Rest is productive. It just doesn’t look like it.', 'health', 'work'),
  th('health-23', 'Be as patient with your recovery as you are with your deadlines.', 'health', 'work'),
  th('health-24', 'A good laugh is a free workout for the heart.', 'health', 'relationships'),
  th('health-25', 'Skip the comparison. Your body has its own timeline.', 'health', 'mind'),
  th('health-26', 'Say goodnight to your day on purpose.', 'health', 'general'),
  th('health-27', 'Moving a little every day beats moving a lot once.', 'health', 'growth'),
  th('health-28', 'Check in: are you hungry, tired, or just bored?', 'health', 'mind'),
  th('health-29', 'Treat your energy as something you’re spending, not something you owe.', 'health', 'work'),
  th('health-30', 'Take care of the body that carries your ideas.', 'health', 'creativity'),

  // learning
  th('learning-01', 'You’ll understand it better after you’ve tried to explain it.', 'learning', 'relationships'),
  th('learning-02', 'Learn a little every day and watch the totals surprise you.', 'learning', 'growth'),
  th('learning-03', 'Being confused means you’re near the edge of something new.', 'learning', 'mind'),
  th('learning-04', 'Write down what you learned today. Memory is a leaky bucket.', 'learning'),
  th('learning-05', 'Questions are the shortcuts experts used to get there.', 'learning'),
  th('learning-06', 'Revisit an old idea with fresh eyes. It might be a different idea now.', 'learning', 'mind'),
  th('learning-07', 'Read one page slowly rather than ten fast.', 'learning', 'mind'),
  th('learning-08', 'Test what you know by teaching someone who’s new.', 'learning', 'relationships'),
  th('learning-09', 'The best teacher is often the person who was lost last month.', 'learning', 'relationships'),
  th('learning-10', 'Mistakes are the tuition you pay for competence.', 'learning', 'growth'),
  th('learning-11', 'Curiosity doesn’t retire. Keep it fed.', 'learning', 'general'),
  th('learning-12', 'Find the simplest version of a hard idea, then build up.', 'learning', 'work'),
  th('learning-13', 'Skim to find. Read to learn.', 'learning'),
  th('learning-14', 'Get comfortable saying “I don’t know yet.”', 'learning', 'growth'),
  th('learning-15', 'Practice beats talent when talent stops practising.', 'learning', 'work'),
  th('learning-16', 'Break the skill into pieces small enough to finish today.', 'learning', 'work'),
  th('learning-17', 'Learn the why and the how will follow.', 'learning'),
  th('learning-18', 'Seek out someone who disagrees and ask for their best reason.', 'learning', 'relationships'),
  th('learning-19', 'A new word is a new way to see.', 'learning', 'creativity'),
  th('learning-20', 'Sleep on what you studied. Your brain files it while you’re away.', 'learning', 'health'),
  th('learning-21', 'Try the problem before you look up the answer.', 'learning', 'growth'),
  th('learning-22', 'Spaced repetition is just kindness to your future memory.', 'learning', 'mind'),
  th('learning-23', 'Learn from people twice your age and half your age.', 'learning', 'relationships'),
  th('learning-24', 'You don’t need more information. You need one idea you actually use.', 'learning', 'work'),
  th('learning-25', 'Reread the thing that changed you last year.', 'learning', 'growth'),
  th('learning-26', 'Go back to the fundamentals. They’ve gotten deeper since you last looked.', 'learning', 'mind'),
  th('learning-27', 'Be the beginner in one room this week.', 'learning', 'growth'),
  th('learning-28', 'Teach yourself something that has no immediate payoff.', 'learning', 'creativity'),
  th('learning-29', 'Let boredom push you toward a book.', 'learning', 'general'),
  th('learning-30', 'Today’s small lesson is tomorrow’s foundation.', 'learning', 'growth'),

  // relationships
  th('relationships-01', 'Listen to understand, not to reply.', 'relationships'),
  th('relationships-02', 'Message the person you’ve been meaning to. Today is as good as it gets.', 'relationships'),
  th('relationships-03', 'Kindness costs little and is remembered for a long time.', 'relationships', 'general'),
  th('relationships-04', 'You can love someone and still need distance.', 'relationships', 'mind'),
  th('relationships-05', 'Ask a second question. It shows you were really listening.', 'relationships', 'learning'),
  th('relationships-06', 'Say the appreciation out loud. It rarely gets said enough.', 'relationships'),
  th('relationships-07', 'Forgive in the amount that lets you move, even if they never ask.', 'relationships', 'health'),
  th('relationships-08', 'The people worth keeping make your honesty easy.', 'relationships'),
  th('relationships-09', 'Show up in small ways, often. It adds up to trust.', 'relationships', 'growth'),
  th('relationships-10', 'Don’t keep score. Keep company.', 'relationships'),
  th('relationships-11', 'A good apology has no “but” in it.', 'relationships', 'growth'),
  th('relationships-12', 'Be the friend you needed during your hardest year.', 'relationships'),
  th('relationships-13', 'Presence is the most underrated gift.', 'relationships', 'general'),
  th('relationships-14', 'Let people finish their sentences, and sometimes their silences.', 'relationships', 'mind'),
  th('relationships-15', 'Hard conversations get harder the longer they’re postponed.', 'relationships', 'growth'),
  th('relationships-16', 'Notice who is quiet in the room, and make a little space.', 'relationships'),
  th('relationships-17', 'Thank someone who doesn’t expect it.', 'relationships', 'general'),
  th('relationships-18', 'You don’t have to fix them. Sometimes you just have to stay.', 'relationships'),
  th('relationships-19', 'Be generous with context. Most conflicts are misunderstood intentions.', 'relationships', 'mind'),
  th('relationships-20', 'Remember the small things people tell you. They matter most.', 'relationships'),
  th('relationships-21', 'The best compliments are specific.', 'relationships', 'creativity'),
  th('relationships-22', 'Check on the strong friend. They’re often the quietest.', 'relationships', 'health'),
  th('relationships-23', 'Choose the relationships that feel like exhaling.', 'relationships', 'health'),
  th('relationships-24', 'Boundaries are a way of saying “I want to stay.”', 'relationships', 'growth'),
  th('relationships-25', 'Don’t rehearse the argument. Try the conversation.', 'relationships', 'mind'),
  th('relationships-26', 'Respond to the person, not to your assumption of them.', 'relationships', 'mind'),
  th('relationships-27', 'Make time for people who don’t need you to be anything.', 'relationships', 'general'),
  th('relationships-28', 'A shared laugh repairs more than a perfect argument.', 'relationships', 'health'),
  th('relationships-29', 'Give your full attention for five minutes and watch what changes.', 'relationships', 'mind'),
  th('relationships-30', 'Say “I’m glad you’re here” more often than you think you need to.', 'relationships'),

  // general
  th('general-01', 'Today doesn’t need to be remarkable to be worth having.', 'general'),
  th('general-02', 'Look up. The sky changes while you’re busy.', 'general', 'mind'),
  th('general-03', 'Small joys aren’t distractions from a good life. They are the good life.', 'general'),
  th('general-04', 'Begin where you are. There’s nowhere else to begin.', 'general', 'growth'),
  th('general-05', 'Let one thing be enough today.', 'general', 'mind'),
  th('general-06', 'Ordinary days build extraordinary lives.', 'general', 'growth'),
  th('general-07', 'Gratitude is attention aimed at what’s already here.', 'general', 'mind'),
  th('general-08', 'Be gentle with the pace of today.', 'general', 'health'),
  th('general-09', 'Wonder is free and always in season.', 'general', 'creativity'),
  th('general-10', 'Do one thing slowly and see what it shows you.', 'general', 'mind'),
  th('general-11', 'The best part of the day is often the part you didn’t plan.', 'general'),
  th('general-12', 'Leave a little room for surprise.', 'general', 'creativity'),
  th('general-13', 'Today is the youngest you’ll ever be.', 'general', 'growth'),
  th('general-14', 'You’re allowed to take up space.', 'general', 'relationships'),
  th('general-15', 'Notice three things you’re glad exist.', 'general', 'mind'),
  th('general-16', 'Every ending is a quiet beginning in disguise.', 'general', 'growth'),
  th('general-17', 'Let the small wins count. They do.', 'general', 'growth'),
  th('general-18', 'Be where your feet are.', 'general', 'mind'),
  th('general-19', 'Rest isn’t giving up. It’s gathering strength.', 'general', 'health'),
  th('general-20', 'The world is large and you’re allowed to be curious about it.', 'general', 'learning'),
  th('general-21', 'Say yes to the thing that makes you feel a little more alive.', 'general', 'creativity'),
  th('general-22', 'Close one open loop today.', 'general', 'work'),
  th('general-23', 'It’s okay to be a work in progress. Everyone is.', 'general', 'growth'),
  th('general-24', 'Listen to the sounds around you for one full minute.', 'general', 'mind'),
  th('general-25', 'Today’s tiny decision may be tomorrow’s turning point.', 'general', 'growth'),
  th('general-26', 'A good day is often just a few good moments, noticed.', 'general'),
  th('general-27', 'You’re doing better than the version of you that’s worrying.', 'general', 'mind'),
  th('general-28', 'Choose one kind thing to carry through the day.', 'general', 'relationships'),
  th('general-29', 'Hold the day lightly and it will hold you back.', 'general'),
  th('general-30', 'Take a breath, then take the next step.', 'general', 'health'),
];

const THOUGHT_BY_ID: Record<string, Thought> = Object.fromEntries(
  DAILY_THOUGHTS.map(t => [t.id, t]),
);

export function thoughtById(id: string): Thought | undefined {
  return THOUGHT_BY_ID[id];
}

/** Stable integer for a local calendar day (timezone-independent within a day). */
export function dayNumber(d: Date = new Date()): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** YYYY-MM-DD key for the local calendar day. */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Consecutive days step this far through the pool, so neighbouring days land on
// different themes instead of walking down one themed block. It is prime, so it is
// coprime to any pool size that is not a multiple of it, which is what makes the
// mapping below a permutation (every thought exactly once per pool-length days).
const DAY_STRIDE = 7919;

/**
 * Choose today's thought. A pure function of the calendar day: the same day gives
 * the same thought on every device, and no thought repeats until all of them have
 * been shown (DAILY_THOUGHTS.length days).
 *
 * This replaced a version that excluded the thoughts a device had "seen". That
 * list lives in the store, so it reset on reinstall and again whenever the pool was
 * used up, and the new cycle only excluded the single latest thought, so a thought
 * from the end of the last cycle could come back within six days.
 *
 * `interests` and `seenIds` are still accepted so callers need not change, but they
 * no longer influence the pick: biasing the pick by interest cannot be combined
 * with a no-repeat guarantee that does not depend on stored history.
 */
export function pickThought(opts: { interests?: string[]; seenIds?: string[]; date?: Date } = {}): Thought {
  const n = DAILY_THOUGHTS.length;
  const idx = (((dayNumber(opts.date) * DAY_STRIDE) % n) + n) % n;
  return DAILY_THOUGHTS[idx];
}
