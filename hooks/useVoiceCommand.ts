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

const RECORD_FORMAT = Platform.OS === 'ios' ? 'wav' : 'm4a';
const RECORD_OPTIONS = Platform.OS === 'ios' ? WAV_OPTIONS : RecordingPresets.HIGH_QUALITY;

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

  const start = useCallback(async () => {
    if (busyRef.current) return;
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
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      // fall through — handled below
    } finally {
      busyRef.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }

    if (!uri) {
      setState({ ...IDLE, phase: 'error', error: 'no-audio' });
      return;
    }

    try {
      const audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const { data, error } = await supabase.functions.invoke('voice-command', {
        body: { audio, format: RECORD_FORMAT, locale: appLanguage },
      });
      if (error) throw error;

      const result = normalizeResult(data);
      const outcome = dispatchVoiceIntent(result);
      setState({
        phase: 'done',
        transcript: result.transcript,
        reply: outcome.reply || result.reply,
        error: outcome.handled ? null : 'not-understood',
      });
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

  return { state, start, stopAndRun, cancel, reset };
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
