import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * Guards the only place a new user is asked for notification permission.
 *
 * Before this, every push prompt sat behind a control users had to go find, so
 * 52 of 54 accounts never saw one and personalized-fanout delivered to nobody.
 * The regression is silent by nature — the nudge cron stays green and returns
 * {"sent":0} — so it needs a test rather than a comment.
 */

const registerForPush = vi.fn(() => Promise.resolve({ token: 't', granted: true }));
vi.mock('../lib/push', () => ({ registerForPush }));

// The composer is the only thing that calls onAnswered; stand in for it with a
// button so the test drives the real handler in welcome.tsx.
vi.mock('../components/daily/DailyQuestionComposer', () => ({
  DailyQuestionComposer: ({ onSubmitted }: { onSubmitted: () => void }) =>
    React.createElement('button', { onClick: onSubmitted, 'data-testid': 'answer' }, 'answer'),
}));

const replace = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ replace, back: vi.fn(), canGoBack: () => false }) }));

vi.mock('../lib/supabaseEchoApi', () => ({
  fetchTodaysDailyQuestion: () => Promise.resolve({ id: 'q1', prompt: 'What mattered today?' }),
  fetchDailyAnswerStreak: () => Promise.resolve(3),
}));
vi.mock('../lib/firstRunQuestion', () => ({
  getFirstRunFallbackQuestion: () => ({ id: 'fallback', prompt: 'What mattered today?' }),
}));
vi.mock('../src/shared/lib/analytics', () => ({ track: vi.fn() }));

const setHasCompletedFirstRun = vi.fn();

// Deliberately NOT mocking useTheme: it is a pure function of this state, so
// feeding it the real defaults exercises the actual styling path instead of a
// hand-rolled shape that drifts from it.
const storeState: Record<string, unknown> = {
  hasCompletedFirstRun: false,
  setHasCompletedFirstRun,
  theme: 'midnight',
  darkMode: true,
  accentColor: 'ember',
  pureBlackBackground: false,
  fontSize: 'medium',
  fontStyle: 'inter',
  fontScale: 1,
  reduceAnimations: true,
  showAvatars: true,
  roundedCorners: 'medium',
};
vi.mock('../store/useAppStore', () => ({
  useAppStore: (sel: (s: Record<string, unknown>) => unknown) => sel(storeState),
}));
vi.mock('../src/shared/lib/i18n', () => ({ useI18n: () => ({ t: (k: string) => k }), ttx: (k: string) => k }));

describe('welcome first-run', () => {
  beforeEach(() => { registerForPush.mockClear(); });

  it('asks for push permission once the daily question is answered', async () => {
    const { default: WelcomeScreen } = await import('./welcome');
    render(React.createElement(WelcomeScreen));

    const button = await screen.findByTestId('answer');
    expect(registerForPush).not.toHaveBeenCalled();

    fireEvent.click(button);

    expect(registerForPush).toHaveBeenCalledTimes(1);
  });
});
