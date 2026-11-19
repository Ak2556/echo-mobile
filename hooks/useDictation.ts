// Speech to text for a text box: the mic button on the daily answer.
//
// It uses the phone's own speech recogniser through lib/voice/speechRecognition
// and nothing else: no upload, no model call, so it costs no AI quota and needs
// no AI consent. When the recogniser is missing (an old binary, or an Android
// phone with no recognition service) `available` is false and the caller hides
// the button rather than offering one that cannot work.
//
// Interim results stream in while the person talks so the box can show the
// words as they come; only the final result is committed. The recogniser stops
// on its own after a pause, and tapping the button again stops it early. Either
// way the final words arrive through onFinal.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SpeechRecognition,
  useSpeechEvent,
  canRecognise,
  claimSpeech,
  speechOwnedBy,
} from '../lib/voice/speechRecognition';
import { toSpeechLocale } from '../lib/voice/voiceLocale';
import { stopSpeaking } from '../lib/mini-apps/tts';
import { showToast } from '../components/ui/Toast';
import { useI18n } from '../lib/i18n/i18n';
import { useAppStore } from '../store/useAppStore';

interface DictationHandlers {
  /** The words heard so far in this utterance; '' clears the preview. */
  onInterim: (text: string) => void;
  /** The finished utterance, ready to append. */
  onFinal: (text: string) => void;
}

export function useDictation({ onInterim, onFinal }: DictationHandlers) {
  const { t } = useI18n();
  const appLanguage = useAppStore(s => s.appLanguage);
  const [available] = useState(canRecognise);
  const [listening, setListening] = useState(false);
  const activeRef = useRef(false);

  // Latest handlers without re-subscribing the native listeners each render.
  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  const finish = useCallback(() => {
    activeRef.current = false;
    setListening(false);
    handlers.current.onInterim('');
  }, []);

  useSpeechEvent('result', (event: any) => {
    if (!activeRef.current) return;
    // A voice command took the recogniser: these words are not the answer.
    if (!speechOwnedBy('dictation')) { finish(); return; }
    const text: string = event?.results?.[0]?.transcript ?? '';
    if (event?.isFinal) {
      handlers.current.onInterim('');
      handlers.current.onFinal(text);
    } else {
      handlers.current.onInterim(text);
    }
  });

  useSpeechEvent('end', () => {
    if (!activeRef.current) return;
    finish();
  });

  useSpeechEvent('error', (event: any) => {
    if (!activeRef.current) return;
    const owned = speechOwnedBy('dictation');
    finish();
    if (!owned) return;
    const code = event?.error ?? 'unknown';
    // 'aborted' is us stopping it; silence ends quietly with nothing added.
    if (code === 'aborted' || code === 'no-speech') return;
    if (code === 'not-allowed' || code === 'service-not-allowed') showToast(t('voice.micDenied'));
    else showToast(t('voice.failed'));
  });

  const start = useCallback(async () => {
    if (!SpeechRecognition || activeRef.current) return;
    stopSpeaking(); // the question's read-aloud would otherwise be transcribed
    try {
      const perm = await SpeechRecognition.requestPermissionsAsync();
      if (!perm.granted) {
        showToast(t('voice.micDenied'));
        return;
      }
      claimSpeech('dictation');
      activeRef.current = true;
      setListening(true);
      SpeechRecognition.start({
        lang: toSpeechLocale(appLanguage),
        interimResults: true,
        continuous: false,
        // Same reasoning as the voice command path: forcing on-device fails on
        // phones with no offline Hindi model, which is most of them.
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
        maxAlternatives: 1,
      });
    } catch {
      finish();
      showToast(t('voice.failed'));
    }
  }, [appLanguage, finish, t]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    // stop() makes the recogniser deliver its final result, then 'end'.
    try {
      SpeechRecognition?.stop();
    } catch {
      finish();
    }
  }, [finish]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else void start();
  }, [start, stop]);

  // Leaving the screen mid-sentence must not leave the microphone open.
  useEffect(() => () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try {
      SpeechRecognition?.abort();
    } catch {
      // Nothing to clean up if it already stopped.
    }
  }, []);

  return { available, listening, toggle };
}
