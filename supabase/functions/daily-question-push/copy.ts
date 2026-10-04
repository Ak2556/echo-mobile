// Copy for the daily-question push. The question itself is the hook, so it is
// the body; the title carries the personality, picked per message so it
// varies across people too.

export const DAILY_TITLES = [
  "Today's question just dropped 👀",
  'Brain, meet today’s question',
  'Two minutes, one honest take',
  'Today’s question is a good one',
  'The question is out. Your move.',
  'Warning: mildly provocative question inside',
  'Your daily excuse to have an opinion',
  'Quick — before you overthink it',
  'Plot twist: today’s question is about you',
  'Hot take incubator, now open',
  'Answer this before your coffee gets cold',
  'Your opinion has been requested. No pressure, some pressure.',
  'Small question, big feelings',
  'Say something true. We dare you.',
  'Today’s question would like a word',
  'Opinions wanted. Yours specifically.',
  'Bold of today’s question to assume you have no take.',
  'Today’s question is here. Silence is also an answer, but a boring one.',
];

export function pickTitle(random: () => number = Math.random): string {
  return DAILY_TITLES[Math.floor(random() * DAILY_TITLES.length)];
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}
