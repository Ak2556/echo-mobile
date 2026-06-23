const INTEREST_PROMPTS: Record<string, string> = {
  // thinking & knowledge
  philosophy: 'What is a belief you hold that you cannot fully defend?',
  science: 'What scientific idea changed how you think about everyday life?',
  psychology: 'What is a pattern in yourself you only noticed by watching someone else?',
  economics: 'What is a trade-off you see people make that almost never pays off?',
  history: 'What historical event do you think gets the wrong lesson drawn from it?',
  politics: 'What is a political opinion you hold that does not fit neatly on either side?',
  // creative & culture
  writing: 'What sentence have you read this year that you cannot forget?',
  art: 'What piece of art has changed how you see the world?',
  film: 'What is a film that deserves a rewatch every few years?',
  music: 'What is a song that always pulls you out of a bad mood?',
  books: 'What book do you give as a gift more than once?',
  design: 'What is a piece of design you love and never tire of?',
  // world & society
  technology: 'What piece of technology do you wish more people used?',
  tech: 'What piece of technology do you wish more people used?',
  startups: 'What is a startup idea you had that someone else eventually built?',
  climate: 'What is the most useful thing an individual can actually do about climate change?',
  education: 'What is something important you learned that school never taught you?',
  culture: 'What is a cultural moment you keep coming back to?',
  media: 'What piece of media surprised you more than you expected?',
  // life & wellbeing
  health: 'What is a health habit that made a bigger difference than you expected?',
  'mental-health': 'What is one thing that genuinely helps when everything feels like too much?',
  fitness: 'What is the smallest habit that changed your fitness?',
  spirituality: 'What practice has given you the most consistent sense of meaning?',
  nature: 'What is a place outside you go to think clearly?',
  // everyday life
  career: 'What is the best career advice you received that took you years to actually act on?',
  finance: 'What is a money lesson you wish you had learned five years earlier?',
  relationships: 'What is something you wish you had said earlier in an important relationship?',
  parenting: 'What is something you thought you would do as a parent that you never actually do?',
  travel: 'Where would you send a friend who has one weekend and no plans?',
  food: 'What is the dish you would cook to convince someone you can really cook?',
  // fun & play
  gaming: 'What is the most underrated mechanic in a game you love?',
  sports: 'What athletic moment would you show someone who claims not to care about sports?',
  fashion: 'What is a piece of clothing you own that says something true about you?',
  // legacy ids still in prod
  coding: 'What is a bug you remember years later, and what did it teach you?',
  photography: 'What photo means more to you than it probably should?',
  comedy: 'Who makes you laugh in a way you cannot explain to other people?',
  podcasts: 'What podcast episode have you recommended the most?',
};

export const DEFAULT_ONBOARDING_PROMPT = 'What is a piece of advice you ignored that turned out to be right?';

export function primaryInterestPrompt(interestId?: string): string {
  if (!interestId) return DEFAULT_ONBOARDING_PROMPT;
  return INTEREST_PROMPTS[interestId] ?? DEFAULT_ONBOARDING_PROMPT;
}
