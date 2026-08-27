// useVoiceCommand — the hands-free control loop.
//
// record (expo-audio, already in the dev client) → base64 → voice-command edge
// function (Gemini does STT + intent in one call) → dispatch the intent. No new
// native module, so it runs on the current build. TTS read-back is added later
// with a native rebuild; until then the overlay shows the reply text.

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
import { dispatchVoiceIntent } from '../lib/voice/dispatch';
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

  const start = useCallback(async () => {
    if (busyRef.current) return;
    stopSpeaking(); // don't record our own read-back
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        setState({ ...IDLE, phase: 'error', error: 'mic-permission' });
        return;
      }
      busyRef.current = true;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState({ phase: 'listening', transcript: '', reply: '', error: null });
    } catch {
      busyRef.current = false;
      setState({ ...IDLE, phase: 'error', error: 'record-failed' });
    }
  }, [recorder]);

  // Stop recording, transcribe, and act. Call this when the user releases the
  // mic (or when a silence timeout fires).
  const stopAndRun = useCallback(async () => {
    if (state.phase !== 'listening') return;
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
      if (state.phase === 'listening') await recorder.stop();
    } catch {
      // ignore
    } finally {
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
