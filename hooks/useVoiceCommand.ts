// useVoiceCommand — the hands-free control loop.
//
// Two paths, fast first:
//
//   on-device speech recognition → transcript → matchLocalIntent → dispatch
//
// Commands people actually repeat ("go home", "open notes", "trending") never
// leave the phone. The old path measured roughly a quarter of a second before
// the edge function did any work at all, plus upload and model inference on top
// of that, and it ran for every utterance including the trivial ones.
//
// Anything the local matcher will not confidently claim falls through to the
// model — the transcript goes as text, not audio, so even the slow path stops
// uploading a recording. If speech recognition is unavailable on the device at
// all, the original record-and-upload path still runs unchanged.

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type RecordingOptions,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { dispatchVoiceIntent } from '../lib/voice/dispatch';
import { matchLocalIntent } from '../lib/voice/localIntent';
import { toSpeechLocale } from '../lib/voice/voiceLocale';
import { speak, stopSpeaking } from '../lib/tts';
import { VOICE_INTENTS, type VoicePhase, type VoiceResult } from '../lib/voice/types';

// iOS records linear-PCM WAV (universally accepted by the speech model); Android
// falls back to the reliable AAC/m4a preset. The format string is sent to the
// edge function so the model knows how to decode.
const WAV_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// Android recorded at the HIGH_QUALITY preset — 44.1kHz, stereo, 128kbps —
// while iOS was deliberately tuned to 16kHz mono. Speech recognition gains
// nothing above 16kHz mono, so every command was uploading roughly five times
// the bytes it needed to, and upload sits directly on the path between the user
// finishing their sentence and anything happening.
const M4A_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
};

const RECORD_FORMAT = Platform.OS === 'ios' ? 'wav' : 'm4a';
const RECORD_OPTIONS = Platform.OS === 'ios' ? WAV_OPTIONS : M4A_OPTIONS;

export interface VoiceCommandState {
  phase: VoicePhase;
  transcript: string;
  reply: string;
  error: string | null;
}

const IDLE: VoiceCommandState = { phase: 'idle', transcript: '', reply: '', error: null };

export function useVoiceCommand() {
  const recorder = useAudioRecorder(RECORD_OPTIONS);
  const [state, setState] = useState<VoiceCommandState>(IDLE);
  const appLanguage = useAppStore(s => s.appLanguage);
  const busyRef = useRef(false);
  // 'stt' once on-device recognition has started, so the recorder teardown and
  // the result handler know which path is live.
  const modeRef = useRef<'stt' | 'audio' | null>(null);

  const reset = useCallback(() => setState(IDLE), []);

  const runTextCommand = useCallback((text: string) => {
    setState({ ...IDLE, phase: 'thinking' });
    setTimeout(() => {
      const t = text.toLowerCase();
      let intent: VoiceResult['intent'] = 'unknown';
      let args: Record<string, unknown> = {};

      if (t.includes('home') || t.includes('होम')) { intent = 'navigate'; args = { destination: 'home' }; }
      else if (t.includes('explore') || t.includes('search')) { intent = 'navigate'; args = { destination: 'explore' }; }
      else if (t.includes('create') || t.includes('post') || t.includes('echo')) { intent = 'navigate'; args = { destination: 'create' }; }
      else if (t.includes('settings')) { intent = 'navigate'; args = { destination: 'settings' }; }
      else if (t.includes('profile')) { intent = 'navigate'; args = { destination: 'you' }; }
      else if (t.includes('dark') || t.includes('light')) { intent = 'set_theme'; args = { theme: t.includes('dark') ? 'dark' : 'light' }; }
      else if (t.includes('refresh') || t.includes('रीफ्रेश')) { intent = 'refresh'; }
      else if (t.includes('back')) { intent = 'go_back'; }

      const result: VoiceResult = {
        transcript: text,
        locale: appLanguage,
        intent,
        args,
        reply: intent !== 'unknown' ? 'Done (offline mode)' : "I didn't catch that (offline mode)",
      };

      const outcome = dispatchVoiceIntent(result);
      setState({ phase: outcome.handled ? 'done' : 'error', transcript: text, reply: outcome.reply || result.reply, error: outcome.handled ? null : 'not-understood' });
    }, 150);
  }, [appLanguage]);

  /**
   * Act on a transcript, however it was produced.
   *
   * The local matcher gets first refusal. When it claims the phrase the action
   * runs immediately with no network at all — that is the whole point of doing
   * recognition on the device. When it declines, the transcript goes to the
   * model as text; still a round trip, but no audio upload attached to it.
   */
  const runTranscript = useCallback(async (transcript: string) => {
    const local = matchLocalIntent(transcript, appLanguage);
    if (local) {
      const outcome = dispatchVoiceIntent(local);
      if (outcome.handled) {
        const reply = outcome.reply || local.reply;
        if (reply && !outcome.spoken) speak(reply, { language: appLanguage, id: 'voice-reply' });
        setState({ phase: 'done', transcript, reply, error: null });
        return;
      }
      // Matched a phrase but the action refused: fall through to the model
      // rather than telling the user it worked.
    }

    setState(s => ({ ...s, phase: 'thinking', transcript }));
    try {
      const { data, error } = await supabase.functions.invoke('voice-command', {
        body: { text: transcript, locale: appLanguage },
      });
      if (error) throw error;
      const result = normalizeResult(data);
      const outcome = dispatchVoiceIntent(result);
      const reply = outcome.reply || result.reply;
      if (outcome.handled) {
        if (reply && !outcome.spoken) speak(reply, { language: appLanguage, id: 'voice-reply' });
        setState({ phase: 'done', transcript: result.transcript || transcript, reply, error: null });
      } else {
        setState({ phase: 'error', transcript: result.transcript || transcript, reply: '', error: 'not-understood' });
      }
    } catch {
      setState({ ...IDLE, phase: 'error', transcript, error: 'transcribe-failed' });
    }
  }, [appLanguage]);

  // On-device recognition results. `isFinal` matters: interim results stream in
  // while the user is still talking and acting on those would fire commands
  // mid-sentence.
  useSpeechRecognitionEvent('result', event => {
    if (modeRef.current !== 'stt') return;
    const transcript = event?.results?.[0]?.transcript ?? '';
    if (!event?.isFinal || !transcript.trim()) return;
    modeRef.current = null;
    busyRef.current = false;
    void runTranscript(transcript.trim());
  });

  useSpeechRecognitionEvent('error', event => {
    if (modeRef.current !== 'stt') return;
    modeRef.current = null;
    busyRef.current = false;

    const code = event?.error ?? 'unknown';
    if (__DEV__) {
      // Swallowing this code cost a debugging round trip: every failure looked
      // like "not understood" whatever had actually gone wrong.
      console.log(`[voice] recognition error: ${code} — ${event?.message ?? ''}`);
    }

    // Distinguish the ones the user can act on from the ones they cannot.
    const mapped =
      code === 'not-allowed' || code === 'service-not-allowed'
        ? 'mic-permission'
        : code === 'no-speech'
          ? 'not-understood'
          : 'transcribe-failed';
    setState({ ...IDLE, phase: 'error', error: mapped });
  });

  const start = useCallback(async () => {
    if (busyRef.current) return;
    stopSpeaking(); // don't record our own read-back

    // Fast path. Recognition on the device means the transcript exists the
    // moment the user stops talking, so a recognised command dispatches with no
    // network at all. Availability is checked rather than assumed — an Android
    // build without a recognition service, or a locale with no model, must fall
    // back rather than hang on a listener that never fires.
    try {
      if (ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perm.granted) {
          busyRef.current = true;
          modeRef.current = 'stt';
          ExpoSpeechRecognitionModule.start({
            // appLanguage is a bare two-letter code; the recogniser needs a
            // BCP-47 tag and answers a bare one with language-not-supported.
            lang: toSpeechLocale(appLanguage),
            interimResults: true,
            continuous: false,
            // Not forced on-device. Requiring it fails outright on a device with
            // no offline model for the locale, which is most devices for most
            // Indian languages — an earlier comment here claimed the module
            // falls back on its own, which was an assumption and wrong. Android
            // already prefers an installed offline model when one exists, so
            // leaving this false keeps the fast path where it is available and
            // a working path everywhere else.
            requiresOnDeviceRecognition: false,
            maxAlternatives: 1,
          });
          setState({ phase: 'listening', transcript: '', reply: '', error: null });
          return;
        }
      }
    } catch {
      // Recognition refused to start; the recorder below still works.
      modeRef.current = null;
      busyRef.current = false;
    }

    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        setState({ ...IDLE, phase: 'error', error: 'mic-permission' });
        return;
      }
      busyRef.current = true;
      modeRef.current = 'audio';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState({ phase: 'listening', transcript: '', reply: '', error: null });
    } catch {
      busyRef.current = false;
      setState({ ...IDLE, phase: 'error', error: 'record-failed' });
    }
  }, [recorder, appLanguage]);

  // Stop recording, transcribe, and act. Call this when the user releases the
  // mic (or when a silence timeout fires).
  const stopAndRun = useCallback(async () => {
    if (state.phase !== 'listening') return;

    // On the recognition path there is nothing to upload — stopping makes the
    // recognizer emit its final result, which the 'result' listener acts on.
    if (modeRef.current === 'stt') {
      setState(s => ({ ...s, phase: 'thinking' }));
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        modeRef.current = null;
        busyRef.current = false;
        setState({ ...IDLE, phase: 'error', error: 'transcribe-failed' });
      }
      return;
    }

    setState(s => ({ ...s, phase: 'thinking' }));
    let uri: string | null = null;
    const t0 = Date.now();
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      // fall through — handled below
    } finally {
      busyRef.current = false;
      // Deliberately not awaited. Releasing the audio session is cleanup, not a
      // precondition for uploading, and awaiting it here put a native call
      // between the user finishing their sentence and the request leaving the
      // phone. It still runs; it just no longer blocks.
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }

    if (!uri) {
      setState({ ...IDLE, phase: 'error', error: 'no-audio' });
      return;
    }

    try {
      const audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const tRead = Date.now();
      const { data, error } = await supabase.functions.invoke('voice-command', {
        body: { audio, format: RECORD_FORMAT, locale: appLanguage },
      });
      const tModel = Date.now();
      if (__DEV__) {
        // Where the wait actually goes. Read this with `adb logcat -s ReactNativeJS`.
        console.log(
          `[voice] encode ${tRead - t0}ms · round-trip ${tModel - tRead}ms · ` +
          `total ${tModel - t0}ms · ${Math.round(audio.length / 1024)}KB b64`,
        );
      }
      if (error) throw error;

      const result = normalizeResult(data);
      const outcome = dispatchVoiceIntent(result);
      const reply = outcome.reply || result.reply;
      if (outcome.handled) {
        // Close the voice loop: speak the confirmation back in the user's
        // language, unless the intent already produced speech (e.g. read_feed).
        if (reply && !outcome.spoken) speak(reply, { language: appLanguage, id: 'voice-reply' });
        setState({ phase: 'done', transcript: result.transcript, reply, error: null });
      } else {
        // Action did NOT complete — never show/speak the model's "done!" reply.
        // Surface the not-understood state so the user knows to rephrase.
        setState({ phase: 'error', transcript: result.transcript, reply: '', error: 'not-understood' });
      }
    } catch {
      setState({ ...IDLE, phase: 'error', error: 'transcribe-failed' });
    } finally {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  }, [recorder, state.phase, appLanguage]);

  const cancel = useCallback(async () => {
    try {
      if (modeRef.current === 'stt') {
        ExpoSpeechRecognitionModule.abort();
      } else if (state.phase === 'listening') {
        await recorder.stop();
      }
    } catch {
      // ignore
    } finally {
      modeRef.current = null;
      busyRef.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      setState(IDLE);
    }
  }, [recorder, state.phase]);

  return { state, start, stopAndRun, cancel, reset, runTextCommand };
}

// Coerce the edge function's response into a well-formed VoiceResult.
function normalizeResult(data: unknown): VoiceResult {
  const o = (data ?? {}) as Record<string, unknown>;
  const intent = typeof o.intent === 'string' && (VOICE_INTENTS as readonly string[]).includes(o.intent)
    ? (o.intent as VoiceResult['intent'])
    : 'unknown';
  return {
    transcript: typeof o.transcript === 'string' ? o.transcript : '',
    locale: typeof o.locale === 'string' ? o.locale : '',
    intent,
    args: o.args && typeof o.args === 'object' ? (o.args as Record<string, unknown>) : {},
    reply: typeof o.reply === 'string' ? o.reply : '',
  };
}
