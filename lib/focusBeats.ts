import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type FocusBeatId = 'lofi' | 'rain' | 'forest' | 'brown';

export const FOCUS_BEATS: Record<FocusBeatId, { name: string; detail: string; hz: number; pulse: number; noise: number; volume: number }> = {
  lofi: { name: 'Lo-fi', detail: 'Soft pulse', hz: 110, pulse: 1.6, noise: 0.03, volume: 0.42 },
  rain: { name: 'Rain', detail: 'Steady wash', hz: 146, pulse: 0.8, noise: 0.18, volume: 0.28 },
  forest: { name: 'Forest', detail: 'Warm air', hz: 196, pulse: 0.45, noise: 0.1, volume: 0.24 },
  brown: { name: 'Brown', detail: 'Deep noise', hz: 82, pulse: 0.25, noise: 0.24, volume: 0.3 },
};

const cachedUris: Partial<Record<FocusBeatId, string>> = {};
let audioModeConfigured = false;

function seededNoise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function buildLoopBase64(beat: FocusBeatId): string {
  const config = FOCUS_BEATS[beat];
  const sampleRate = 22050;
  const durationSeconds = 6;
  const samples = sampleRate * durationSeconds;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const noise = seededNoise(config.hz * 1000);
  let brown = 0;

  const w32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const w16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const ws = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };

  ws(0, 'RIFF'); w32(4, 36 + samples * 2);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  w32(16, 16); w16(20, 1); w16(22, 1);
  w32(24, sampleRate); w32(28, sampleRate * 2);
  w16(32, 2); w16(34, 16);
  ws(36, 'data'); w32(40, samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const loopFade = Math.min(1, i / (sampleRate * 0.18), (samples - i) / (sampleRate * 0.18));
    const pulse = 0.58 + Math.sin(2 * Math.PI * config.pulse * t) * 0.18;
    brown = brown * 0.96 + noise() * 0.04;
    const pad =
      Math.sin(2 * Math.PI * config.hz * t) * 0.38 +
      Math.sin(2 * Math.PI * config.hz * 1.505 * t) * 0.18 +
      Math.sin(2 * Math.PI * config.hz * 2.01 * t) * 0.08;
    const sample = (pad * pulse + brown * config.noise) * config.volume * loopFade;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});
}

async function uriForBeat(beat: FocusBeatId): Promise<string> {
  if (cachedUris[beat]) return cachedUris[beat]!;
  if (!FileSystem.cacheDirectory) throw new Error('FileSystem cache unavailable');
  const uri = `${FileSystem.cacheDirectory}echo_focus_${beat}.wav`;
  await FileSystem.writeAsStringAsync(uri, buildLoopBase64(beat), { encoding: FileSystem.EncodingType.Base64 });
  cachedUris[beat] = uri;
  return uri;
}

export async function createFocusBeatPlayer(beat: FocusBeatId): Promise<AudioPlayer> {
  await ensureAudioMode();
  const player = createAudioPlayer({ uri: await uriForBeat(beat) }, { keepAudioSessionActive: true });
  player.loop = true;
  player.volume = FOCUS_BEATS[beat].volume;
  return player;
}
