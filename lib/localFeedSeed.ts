import { FeedItem } from '../types';
import { extractHashtags } from './mapSupabaseEcho';

function seedItem(p: {
  id: string;
  userId?: string;
  username: string;
  displayName?: string;
  avatarColor?: string;
  isVerified?: boolean;
  prompt: string;
  response: string;
  likes: number;
  commentCount?: number;
  repostCount?: number;
  viewCount?: number;
  createdAt: string;
}): FeedItem {
  return {
    id: p.id,
    userId: p.userId ?? `u_seed_${p.id}`,
    username: p.username,
    displayName: p.displayName ?? p.username,
    avatarColor: p.avatarColor ?? '#3B82F6',
    isVerified: p.isVerified ?? false,
    prompt: p.prompt,
    response: p.response,
    likes: p.likes,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    repostCount: p.repostCount ?? 0,
    commentCount: p.commentCount ?? 0,
    viewCount: p.viewCount ?? 0,
    hashtags: extractHashtags(`${p.prompt} ${p.response}`),
    createdAt: p.createdAt,
  };
}

/** Fill missing fields for items saved from share or older shapes. Preserves all media/poll fields. */
export function coerceFeedItem(e: FeedItem): FeedItem {
  const hashtags =
    e.hashtags?.length ? e.hashtags : extractHashtags(`${e.prompt} ${e.response}`);
  return {
    id: e.id,
    userId: e.userId || `u_${e.username}`,
    username: e.username,
    displayName: e.displayName || e.username,
    avatarColor: e.avatarColor || '#3B82F6',
    isVerified: e.isVerified ?? false,
    prompt: e.prompt,
    response: e.response,
    likes: e.likes ?? 0,
    isLiked: e.isLiked ?? false,
    isBookmarked: e.isBookmarked ?? false,
    isReposted: e.isReposted ?? false,
    repostCount: e.repostCount ?? 0,
    commentCount: e.commentCount ?? 0,
    viewCount: e.viewCount ?? 0,
    hashtags,
    createdAt: e.createdAt || new Date().toISOString(),
    // Rich media — must be forwarded or they get silently dropped
    postType: e.postType,
    mediaUris: e.mediaUris,
    videoUri: e.videoUri,
    poll: e.poll,
    repostedBy: e.repostedBy,
    repostedByUsername: e.repostedByUsername,
  };
}

export const LOCAL_SEED_FEED: FeedItem[] = [
  seedItem({
    id: '1',
    username: 'aena_dev',
    displayName: 'Aena',
    isVerified: true,
    prompt: 'Write a haiku about React Native performance.',
    response: 'Frames paint blazing fast,\nReanimated threads dance,\nJank is left behind.',
    likes: 124,
    commentCount: 12,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  }),
  seedItem({
    id: '2',
    username: 'sys_admin',
    prompt: 'How to optimize pgvector queries?',
    response:
      'Ensure you build an HNSW index on the embedding column using vector_cosine_ops and increase maintenance_work_mem during index creation. Also consider using IVFFlat for datasets under 1M rows.',
    likes: 42,
    commentCount: 5,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  }),
  seedItem({
    id: '3',
    username: 'echo_fan',
    prompt: 'What is the fastest mobile framework?',
    response:
      'React Native paired with Expo Router and Reanimated delivers near-native performance with the agility of web development paradigms.',
    likes: 89,
    commentCount: 23,
    repostCount: 2,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  }),
  seedItem({
    id: '4',
    username: 'ml_engineer',
    displayName: 'ML Maya',
    prompt: 'Explain transformers in one paragraph.',
    response:
      'Transformers are neural network architectures that use self-attention mechanisms to weigh the significance of each part of the input data. Unlike RNNs, they process all positions simultaneously, making them highly parallelizable and effective for sequence tasks like translation and text generation.',
    likes: 256,
    commentCount: 31,
    repostCount: 5,
    createdAt: new Date(Date.now() - 28800000).toISOString(),
  }),
  seedItem({
    id: '5',
    username: 'design_lead',
    prompt: 'Best practices for dark mode UI?',
    response:
      'Use elevated surfaces instead of borders for hierarchy. Keep contrast ratios above 4.5:1 for text. Avoid pure black (#000) as your base — use dark grays like #0A0A0A. Use color sparingly as accent, and test with OLED screens.',
    likes: 178,
    commentCount: 14,
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  }),
  seedItem({
    id: '6',
    username: 'backend_pro',
    prompt: 'Explain CQRS pattern simply.',
    response:
      'CQRS separates read and write operations into different models. Writes go through Command handlers that validate and persist changes. Reads use optimized Query models (often denormalized views) for fast retrieval. This lets you scale reads and writes independently.',
    likes: 67,
    commentCount: 8,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  }),
];
