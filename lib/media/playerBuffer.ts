import { Platform } from 'react-native';

/**
 * Android's ExoPlayer buffers up to 20 s of video per player with no limit in bytes. Phone clips run
 * at tens of megabits a second, and ExoPlayer holds the buffer in the Java heap (192 MB on most
 * devices), so a few feed players (the active card plus its warm neighbours) can fill it and the app
 * dies with an OutOfMemoryError inside ExoPlayer:Playback. A feed card only needs a first frame while
 * it waits and a few seconds ahead while it plays.
 *
 * With the byte cap reached before the minimum buffer, ExoPlayer starts playback anyway, so a cap
 * never stalls a high-bitrate clip.
 */
export const FEED_BUFFER = {
  preferredForwardBufferDuration: 8,
  maxBufferBytes: 12 * 1024 * 1024,
} as const;

/** Call from a `useVideoPlayer` setup callback. A no-op off Android, where AVPlayer manages its own memory. */
export function capFeedBuffer(player: { bufferOptions: object }): void {
  if (Platform.OS !== 'android') return;
  try {
    player.bufferOptions = FEED_BUFFER;
  } catch {
    // an older native build without bufferOptions: keep the default rather than fail the card
  }
}
