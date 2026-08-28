/**
 * expo-speech-recognition, loaded so a binary without it survives.
 *
 * A bare `import` of a native module runs at module load, and on a build that
 * predates the dependency it throws "Cannot find native module
 * 'ExpoSpeechRecognition'" before anything renders — the app is dead on launch,
 * not merely missing a feature. That matters more than it sounds: JS-only
 * changes reach devices through `eas update`, so publishing this code to the
 * currently-installed APK would crash every user at startup.
 *
 * Same guard the other native optional dependency uses (see the Skia require in
 * src/features/feed/ui/PhotoEditor.tsx and components/ui/LiquidGlass.tsx).
 *
 * `useSpeechEvent` has to stay callable unconditionally — it is a hook, and
 * React requires the same hooks in the same order on every render. When the
 * module is absent it resolves to a no-op that calls no hooks itself, so the
 * call site never has to branch.
 */

type SpeechModuleShape = {
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
};

let mod: {
  ExpoSpeechRecognitionModule?: SpeechModuleShape;
  useSpeechRecognitionEvent?: (event: string, handler: (e: never) => void) => void;
} | null = null;

try {
  mod = require('expo-speech-recognition');
} catch {
  mod = null;
}

/** True only when the native module is genuinely present in this binary. */
export const SPEECH_AVAILABLE = typeof mod?.ExpoSpeechRecognitionModule?.start === 'function';

export const SpeechRecognition: SpeechModuleShape | null =
  SPEECH_AVAILABLE ? (mod!.ExpoSpeechRecognitionModule as SpeechModuleShape) : null;

const noopEvent = (_event: string, _handler: (e: never) => void): void => {};

export const useSpeechEvent: (event: string, handler: (e: never) => void) => void =
  (SPEECH_AVAILABLE && mod?.useSpeechRecognitionEvent) || noopEvent;

/** Availability plus a working recognition service on the device. */
export function canRecognise(): boolean {
  if (!SpeechRecognition) return false;
  try {
    return SpeechRecognition.isRecognitionAvailable();
  } catch {
    return false;
  }
}
