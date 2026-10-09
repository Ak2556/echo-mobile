/**
 * Which media to start loading for the cards just below the one on screen.
 *
 * Nothing in the app prefetched, so a photo began downloading only when its card
 * entered FlashList's draw distance, and on a slow connection the viewer watched
 * it arrive. Looking a few cards ahead moves that wait to before the scroll gets
 * there. Pure, so the choices (how far, how much, what is never fetched) are
 * tested rather than hidden inside an effect.
 *
 * Deliberately modest: every URI fetched is bandwidth spent on a card the person
 * may never reach, so the reach is short and each card contributes at most a
 * couple of images. A video contributes its poster frame, not the clip.
 */

export interface PrefetchItem {
  id: string;
  mediaUris?: string[];
  videoUri?: string;
}

export interface PrefetchPlan {
  images: string[];
  /** Videos whose poster frame should be loaded. */
  videos: string[];
}

export interface PrefetchOptions {
  /** How many cards below the current one to look at. */
  ahead?: number;
  /** How many of those cards may have their video poster prefetched. */
  videoAhead?: number;
  maxImagesPerItem?: number;
  /** Hard ceiling on what one call may start, whatever the cards hold. */
  maxTotal?: number;
}

const DEFAULTS: Required<PrefetchOptions> = { ahead: 4, videoAhead: 2, maxImagesPerItem: 2, maxTotal: 8 };

/** Only a network URL is worth prefetching: a local file is already on the device. */
export function isRemoteUri(uri: string | undefined): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

export function planMediaPrefetch(
  items: readonly PrefetchItem[],
  currentIndex: number,
  seen: ReadonlySet<string>,
  options: PrefetchOptions = {},
): PrefetchPlan {
  const o = { ...DEFAULTS, ...options };
  const images: string[] = [];
  const videos: string[] = [];
  const taken = new Set<string>();
  const total = () => images.length + videos.length;

  if (!Number.isFinite(currentIndex) || currentIndex < -1) return { images, videos };

  const last = Math.min(items.length - 1, currentIndex + o.ahead);
  for (let i = currentIndex + 1; i <= last && total() < o.maxTotal; i++) {
    const item = items[i];
    if (!item) continue;

    let fromThisItem = 0;
    for (const uri of item.mediaUris ?? []) {
      if (fromThisItem >= o.maxImagesPerItem || total() >= o.maxTotal) break;
      if (!isRemoteUri(uri) || seen.has(uri) || taken.has(uri)) continue;
      taken.add(uri);
      images.push(uri);
      fromThisItem++;
    }

    if (i - currentIndex <= o.videoAhead && total() < o.maxTotal) {
      const v = item.videoUri;
      if (isRemoteUri(v) && !seen.has(v) && !taken.has(v)) {
        taken.add(v);
        videos.push(v);
      }
    }
  }
  return { images, videos };
}
