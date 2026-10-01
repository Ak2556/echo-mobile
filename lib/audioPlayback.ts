import type { AudioStatus } from 'expo-audio';

/**
 * Whether a player has reached the end of its track.
 *
 * `didJustFinish` alone is not enough: on Android a 3-second voice memo
 * played to the end (ExoPlayer released audio focus) and the screen kept
 * showing Pause, because that flag never arrived. The ended state and a
 * stopped player at the end of the track mean the same thing.
 */
export function playbackEnded(status: Pick<AudioStatus, 'didJustFinish' | 'loop' | 'playbackState' | 'playing' | 'duration' | 'currentTime'>): boolean {
  if (status.didJustFinish) return true;
  if (status.loop) return false;
  if (String(status.playbackState).toLowerCase() === 'ended') return true;
  return !status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.25;
}
