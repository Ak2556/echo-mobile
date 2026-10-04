import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ImageSource } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { canReadFrames, frameAt } from './echoMedia';
import { createLimiter } from './limiter';

/**
 * One still frame of a video, to stand in for it in a feed.
 *
 * The posts carry no thumbnail, so it is read from the clip itself:
 *  - iOS: expo-video's generateThumbnailsAsync on a short-lived player.
 *  - Android: the first megabyte of the file is fetched with a Range request and
 *    the EchoMedia module reads a frame from that. Phone-recorded and processed
 *    clips keep their index (moov) at the front, so the start of the file is
 *    enough; a clip that does not simply yields no poster. This is what works
 *    here: expo-video's own thumbnail call fails on Android, and the module's
 *    frameAt cannot open an http URL (MediaMetadataRetriever's Context+Uri
 *    overload only takes content and file URIs).
 * Two at a time, so a screen of videos does not queue a dozen decodes at once.
 * Resolves null where it cannot be had; callers draw a plain tile instead.
 */

const POSTER_TIME_S = 1;
const POSTER_WIDTH = 720;
/** Enough for the index and the first keyframes of a short phone clip. */
const PREFIX_BYTES = 1024 * 1024;

const limit = createLimiter(2);
const cache = new Map<string, Promise<ImageSource | null>>();

/** A stable, filesystem-safe name for a uri (djb2). */
export function posterFileName(uri: string): string {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = ((h << 5) + h + uri.charCodeAt(i)) >>> 0;
  return `poster_${h.toString(36)}.mp4`;
}

async function androidPoster(uri: string): Promise<ImageSource | null> {
  const dir = FileSystem.cacheDirectory;
  if (!canReadFrames() || !dir) return null;
  const path = dir + posterFileName(uri);
  const have = await FileSystem.getInfoAsync(path);
  if (!have.exists) {
    const res = await FileSystem.downloadAsync(uri, path, { headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` } });
    if (res.status !== 206 && res.status !== 200) {
      await FileSystem.deleteAsync(path, { idempotent: true });
      return null;
    }
  }
  for (const ms of [POSTER_TIME_S * 1000, 0]) {
    try {
      return { uri: await frameAt(path, ms, POSTER_WIDTH) };
    } catch {
      // try the first frame, then give up
    }
  }
  await FileSystem.deleteAsync(path, { idempotent: true });
  return null;
}

async function iosPoster(uri: string): Promise<ImageSource | null> {
  // Loaded lazily: expo-video's native module is absent in Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createVideoPlayer } = require('expo-video') as typeof import('expo-video');
  const player = createVideoPlayer({ uri });
  try {
    const [thumb] = await player.generateThumbnailsAsync([POSTER_TIME_S], { maxWidth: POSTER_WIDTH });
    return (thumb as unknown as ImageSource) ?? null;
  } finally {
    player.release();
  }
}

export function loadVideoPoster(uri: string): Promise<ImageSource | null> {
  const hit = cache.get(uri);
  if (hit) return hit;
  const job = limit(() => (Platform.OS === 'android' ? androidPoster(uri) : Platform.OS === 'ios' ? iosPoster(uri) : Promise.resolve(null)))
    .catch((e) => {
      if (__DEV__) console.warn('[video-poster]', String((e as Error)?.message ?? e));
      return null;
    })
    .then((poster) => {
      // A miss is not remembered: the next screen to ask can try again.
      if (!poster) cache.delete(uri);
      return poster;
    });
  cache.set(uri, job);
  return job;
}

export function useVideoPoster(uri: string | undefined): ImageSource | null {
  const [poster, setPoster] = useState<ImageSource | null>(null);
  useEffect(() => {
    if (!uri) return;
    let live = true;
    void loadVideoPoster(uri).then((p) => { if (live) setPoster(p); });
    return () => { live = false; };
  }, [uri]);
  return poster;
}
