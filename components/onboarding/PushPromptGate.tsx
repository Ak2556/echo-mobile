import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { PushPrePrompt } from './PushPrePrompt';
import { mayOfferPush, notePushOffered, registerForPush } from '../../lib/push';
import { hasResolvedAnalyticsConsent } from '../../lib/consent';
import { useAppStore } from '../../store/useAppStore';
import { useTutorialStore } from '../../store/tutorialStore';

const SETTLE_MS = 1200;

/**
 * Offers push to every signed-in user, not only those who publish.
 *
 * The pre-prompt used to appear only after a first Echo, and most people read
 * without posting — so 41 of 46 accounts never saw a permission dialog and the
 * daily question and nudges reached almost nobody. Mounted in the tab layout,
 * so it can only appear once someone is signed in and past onboarding.
 *
 * It stays out of the way of the other first-run surfaces: it waits until the
 * home tour is finished or skipped, and until the analytics consent banner has
 * been answered. Anything it defers is looked at again the next time the app
 * comes to the foreground. How often it may ask lives in `pushPromptPolicy`.
 */
export function PushPromptGate() {
  const hasSeenHomeTutorial = useAppStore(s => s.hasSeenHomeTutorial);
  const setNotificationsEnabled = useAppStore(s => s.setNotificationsEnabled);
  const activeTour = useTutorialStore(s => s.activeTour);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evaluate = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!hasSeenHomeTutorial || activeTour || !hasResolvedAnalyticsConsent()) return;
    timer.current = setTimeout(() => {
      void mayOfferPush().then(ok => {
        // Re-read the tour: one may have started (Settings → Replay tour) while we waited.
        if (!ok || useTutorialStore.getState().activeTour) return;
        notePushOffered();
        setVisible(true);
      }).catch(() => { /* never block the app on a permission read */ });
    }, SETTLE_MS);
  }, [hasSeenHomeTutorial, activeTour]);

  useEffect(() => {
    evaluate();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') evaluate(); });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [evaluate]);

  return (
    <PushPrePrompt
      visible={visible}
      onAccept={async () => {
        setVisible(false);
        const { granted } = await registerForPush();
        setNotificationsEnabled(granted);
      }}
      onDecline={() => setVisible(false)}
    />
  );
}
