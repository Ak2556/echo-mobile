import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';

export type SoundEffect = 'success' | 'error' | 'like' | 'send' | 'pop';

// [frequency Hz, duration ms, volume 0–1]
const EFFECT_CONFIG: Record<SoundEffect, [number, number, number]> = {
  success: [880,  220, 0.35],
  send:    [1100,  80, 0.25],
  like:    [1000, 130, 0.28],
  pop:     [660,  150, 0.30],
  error:   [220,  280, 0.30],
};

const cachedUris: Partial<Record<SoundEffect, string>> = {};

function buildWavBase64(frequency: number, durationMs: number, volume: number): string {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const bytes = new Uint8Array(44 + numSamples * 2);
  const view = new DataView(bytes.buffer);

  const w32 = (o: number, v: number) => view.setUint32(o, v, true);
  const w16 = (o: number, v: number) => view.setUint16(o, v, true);
  const ws  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };

  ws(0,  'RIFF'); w32(4,  36 + numSamples * 2);
  ws(8,  'WAVE'); ws(12, 'fmt ');
  w32(16, 16); w16(20, 1); w16(22, 1);
  w32(24, sampleRate); w32(28, sampleRate * 2);
  w16(32, 2); w16(34, 16);
  ws(36, 'data'); w32(40, numSamples * 2);

  const fi = Math.floor(sampleRate * 0.008);
  const fo = Math.floor(sampleRate * 0.04);
  for (let i = 0; i < numSamples; i++) {
    const env = Math.min(1, i / fi) * Math.min(1, (numSamples - i) / fo);
    const s   = Math.sin(2 * Math.PI * frequency * i / sampleRate) * env * volume * 0x7FFF;
    view.setInt16(44 + i * 2, Math.round(s), true);
  }

  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function getUri(effect: SoundEffect): Promise<string> {
  if (cachedUris[effect]) return cachedUris[effect]!;
  const [freq, dur, vol] = EFFECT_CONFIG[effect];
  const b64 = buildWavBase64(freq, dur, vol);
  const uri = `${FileSystem.cacheDirectory}sfx_${effect}.wav`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  cachedUris[effect] = uri;
  return uri;
}

export function playSoundEffect(effect: SoundEffect): void {
  const { useAppStore } = require('../store/useAppStore') as typeof import('../store/useAppStore');
  if (!useAppStore.getState().soundEnabled) return;

  void (async () => {
    try {
      const uri = await getUri(effect);
      const player = createAudioPlayer({ uri });
      player.play();
      const [, dur] = EFFECT_CONFIG[effect];
      setTimeout(() => { try { player.remove(); } catch {} }, dur + 400);
    } catch {}
  })();
}
