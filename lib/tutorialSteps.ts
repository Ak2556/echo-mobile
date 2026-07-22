/**
 * Interactive coach-mark tour definitions. Each step spotlights one real,
 * on-screen element (by target id, registered via useTutorialTarget) and shows
 * a tooltip. A step with an empty `targetId` renders a centered tooltip with no
 * spotlight (used for the intro/outro).
 */
export interface TutorialStep {
  targetId: string;
  title: string;
  body: string;
  /** Label for the advance button on this step. */
  cta?: string;
}

export const HOME_TOUR: TutorialStep[] = [
  {
    targetId: '',
    title: 'Welcome to Echo 👋',
    body: 'A 20-second tour so you know your way around. You can skip anytime.',
    cta: 'Show me',
  },
  {
    targetId: 'home-nextstep',
    title: 'Your next move',
    body: 'This card always points at one good thing to do next — right now, talk something through with Echo AI.',
  },
  {
    targetId: 'home-feed',
    title: 'The community feed',
    body: 'Real takes from real people. Tap any echo to read the thread or reply.',
  },
  {
    targetId: 'compose-fab',
    title: 'Post your own Echo',
    body: 'A question or a take is enough. Share whenever something’s on your mind.',
    cta: 'Got it',
  },
];

export const TOURS: Record<string, TutorialStep[]> = {
  home: HOME_TOUR,
};
