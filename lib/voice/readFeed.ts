// Hands-free "read the feed to me" — reads the posts currently on the home feed
// aloud, in order. The feed screen publishes its visible items here; the voice
// `read_feed` intent (and anything else) triggers the read.
//
// Decoupled on purpose: the reader never imports the feed screen, and the feed
// screen never imports TTS — they meet through this tiny registry.

import { speakSequence } from '../tts';
import type { AppLanguageCode } from '../languages';
import type { FeedItem } from '../../types';

export interface ReadableItem {
  author: string;
  text: string;
}

let current: ReadableItem[] = [];

/** Called by the feed screen whenever its visible items change. */
export function setReadableFeed(items: FeedItem[]) {
  current = (items ?? [])
    .map((it) => ({
      author: it.displayName || it.username || '',
      text: [it.editorialTitle ?? it.prompt, it.authorNote ?? it.response].filter(Boolean).join('. '),
    }))
    .filter((it) => it.text.trim().length > 0);
}

const MAX_POSTS = 12;

/**
 * Read the current feed aloud. Optionally prefaced with a spoken intro (e.g. the
 * voice command's reply). Returns how many posts were queued so the caller can
 * decide whether it "handled" the request.
 */
export function readFeedAloud(intro?: string, language?: AppLanguageCode): number {
  const posts = current.slice(0, MAX_POSTS);
  const segments: string[] = [];
  if (intro) segments.push(intro);
  // Each post is its own segment so speakSequence voices it in its own language
  // (a Hindi intro then English/Hindi posts each read correctly).
  for (const p of posts) segments.push(`${p.author}. ${p.text}.`);
  if (segments.length === 0) return 0;
  speakSequence(segments, { id: 'read-feed', language });
  return posts.length;
}
