// A curated pool of daily reflective thoughts for the Home "Thought for today"
// card. One is surfaced per calendar day, personalized to the user's interests
// and never repeated until the whole pool has been shown (then a fresh cycle
// begins). Selection is pinned per day by the store, so the same day always
// shows the same thought even across re-renders and app restarts.

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

// Keywords that map a user's free-text interests onto a thought theme. Loose,
// substring-based matching keeps it forgiving of how interests are phrased.
const THEME_KEYWORDS: Record<Exclude<ThemeTag, 'general'>, string[]> = {
  growth: ['growth', 'self', 'improve', 'mindset', 'personal', 'discipline', 'habit', 'goal'],
  mind: ['philosophy', 'mindful', 'meditat', 'psycholog', 'psychology', 'spiritual', 'think', 'stoic', 'wisdom'],
  creativity: ['art', 'music', 'design', 'writ', 'creativ', 'film', 'photo', 'poetry', 'craft'],
  work: ['work', 'business', 'career', 'productiv', 'startup', 'entrepreneur', 'founder', 'leadership'],
  money: ['money', 'finance', 'invest', 'wealth', 'crypto', 'trading', 'stock', 'saving'],
  health: ['health', 'fitness', 'gym', 'wellness', 'run', 'yoga', 'nutrition', 'sport', 'diet', 'mental'],
  learning: ['learn', 'education', 'science', 'read', 'book', 'study', 'tech', 'coding', 'program', 'knowledge', 'curious'],
  relationships: ['relationship', 'love', 'family', 'friend', 'social', 'community', 'connect', 'people'],
};

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

function matchesInterests(thought: Thought, interests: string[]): boolean {
  if (thought.tags.includes('general')) return true;
  return thought.tags.some(tag => {
    if (tag === 'general') return true;
    const keywords = THEME_KEYWORDS[tag] ?? [];
    return interests.some(interest => keywords.some(kw => interest.includes(kw) || kw.includes(interest)));
  });
}

/**
 * Choose today's thought: never one that's already been seen (until the pool is
 * exhausted, then a fresh cycle), preferring ones tuned to the user's interests.
 * Deterministic for a given (day, seen, interests) so the first computation of a
 * new day is stable before the store pins it.
 */
export function pickThought(opts: { interests?: string[]; seenIds?: string[]; date?: Date }): Thought {
  const interests = (opts.interests ?? []).map(s => s.trim().toLowerCase()).filter(Boolean);
  const seen = new Set(opts.seenIds ?? []);

  let unseen = DAILY_THOUGHTS.filter(t => !seen.has(t.id));
  if (unseen.length === 0) unseen = DAILY_THOUGHTS; // whole pool spent → new cycle

  const matched = interests.length ? unseen.filter(t => matchesInterests(t, interests)) : [];
  const candidates = matched.length ? matched : unseen;

  const idx = ((dayNumber(opts.date) % candidates.length) + candidates.length) % candidates.length;
  return candidates[idx];
}
