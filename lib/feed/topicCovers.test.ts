import { describe, expect, it } from 'vitest';
import { deriveTopicFeed } from './echoUX';
import type { FeedItem } from '../../types';

// 2026-11-27: Explore's topic tiles show a photo from the topic. One post with
// three tags put the same photo on three tiles side by side.
const post = (id: string, hashtags: string[], photo?: string) =>
  ({ id, hashtags, prompt: '', response: '', mediaUris: photo ? [photo] : undefined }) as unknown as FeedItem;

describe('topic covers', () => {
  it('gives each photo to one topic only', () => {
    const topics = deriveTopicFeed([
      post('1', ['nature', 'echo', 'newpost'], 'https://m.dev/rose.jpg'),
      post('2', ['nature'], 'https://m.dev/hill.jpg'),
    ]);
    const covers = topics.map(t => t.cover).filter(Boolean);
    expect(new Set(covers).size).toBe(covers.length);
    expect(topics.find(t => t.topic.toLowerCase() === 'nature')?.cover).toBeDefined();
  });

  it('leaves a topic with no unused photo to be drawn in type', () => {
    const topics = deriveTopicFeed([post('1', ['a', 'b'], 'https://m.dev/x.jpg')]);
    expect(topics.filter(t => t.cover)).toHaveLength(1);
  });

  it('never uses a local file as a cover', () => {
    const topics = deriveTopicFeed([post('1', ['a'], 'file:///tmp/x.jpg')]);
    expect(topics[0].cover).toBeUndefined();
  });
});
