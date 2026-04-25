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
  postType?: FeedItem['postType'];
  mediaUris?: string[];
  videoUri?: string;
  poll?: FeedItem['poll'];
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
    postType: p.postType,
    mediaUris: p.mediaUris,
    videoUri: p.videoUri,
    poll: p.poll,
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
    videoQualities: e.videoQualities,
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

  // ── Rich media seed items ────────────────────────────────────────────────

  // Photo post — 4 images
  {
    id: 'photo1',
    userId: 'u_seed_ml',
    username: 'ml_engineer',
    displayName: 'ML Maya',
    avatarColor: '#F59E0B',
    isVerified: true,
    postType: 'photo',
    prompt: 'Our GPU cluster visualized 🔥',
    response: '',
    mediaUris: [
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&q=80',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80',
      'https://images.unsplash.com/photo-1551808525-51a94da548ce?w=600&q=80',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80',
    ],
    hashtags: ['ai', 'ml', 'hardware'],
    likes: 312,
    commentCount: 28,
    repostCount: 14,
    viewCount: 4800,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },

  // Photo post — single image
  {
    id: 'photo2',
    userId: 'u_seed_design',
    username: 'design_lead',
    displayName: 'Design Dan',
    avatarColor: '#EF4444',
    isVerified: true,
    postType: 'photo',
    prompt: 'Dark mode palette study — OLED optimised',
    response: '',
    mediaUris: [
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    ],
    hashtags: ['design', 'darkmode', 'ui'],
    likes: 189,
    commentCount: 17,
    repostCount: 9,
    viewCount: 2600,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 5400000).toISOString(),
  },

  // ── Video posts (Echoes feed) ────────────────────────────────────────────
  // All use Apple public HLS test streams (load instantly on iOS via expo-av AVPlayer)
  {
    id: 'video1',
    userId: 'u_seed_crypto',
    username: 'crypto_kate',
    displayName: 'Kate Web3',
    avatarColor: '#EC4899',
    isVerified: false,
    postType: 'video',
    prompt: 'How zero-knowledge proofs work — 60s explainer',
    response: '',
    videoUri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    videoQualities: [
      { label: 'Auto',  uri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8' },
      { label: '1080p', uri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8' },
      { label: '720p',  uri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8' },
      { label: '480p',  uri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8' },
    ],
    hashtags: ['web3', 'zkp', 'crypto'],
    likes: 224,
    commentCount: 33,
    repostCount: 21,
    viewCount: 8900,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: 'video2',
    userId: 'u_seed_ml',
    username: 'ml_engineer',
    displayName: 'ML Maya',
    avatarColor: '#F59E0B',
    isVerified: true,
    postType: 'video',
    prompt: 'Training a diffusion model from scratch in 90 seconds 🤯',
    response: '',
    videoUri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
    hashtags: ['ai', 'diffusion', 'ml', 'stablediffusion'],
    likes: 1847,
    commentCount: 142,
    repostCount: 89,
    viewCount: 42300,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 21600000).toISOString(),
  },
  {
    id: 'video3',
    userId: 'u_seed_design',
    username: 'design_lead',
    displayName: 'Design Dan',
    avatarColor: '#EF4444',
    isVerified: true,
    postType: 'video',
    prompt: 'My entire dark UI design process in 60 seconds ✨',
    response: '',
    videoUri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
    hashtags: ['design', 'ui', 'darkmode', 'figma'],
    likes: 3210,
    commentCount: 278,
    repostCount: 156,
    viewCount: 91000,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'video4',
    userId: 'u_seed_aena',
    username: 'aena_dev',
    displayName: 'Aena',
    avatarColor: '#3B82F6',
    isVerified: true,
    postType: 'video',
    prompt: 'How I built this app in a weekend with Claude Code 🚀',
    response: '',
    videoUri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
    hashtags: ['buildinpublic', 'reactnative', 'expo', 'ai'],
    likes: 5621,
    commentCount: 431,
    repostCount: 302,
    viewCount: 128000,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'video5',
    userId: 'u_seed_backend',
    username: 'backend_pro',
    displayName: 'Backend Ben',
    avatarColor: '#10B981',
    isVerified: false,
    postType: 'video',
    prompt: 'PostgreSQL vs SQLite — which should you pick for mobile apps?',
    response: '',
    videoUri: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    hashtags: ['postgres', 'sqlite', 'database', 'backend'],
    likes: 892,
    commentCount: 74,
    repostCount: 41,
    viewCount: 19400,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },

  // Poll post
  {
    id: 'poll1',
    userId: 'u_seed_aena',
    username: 'aena_dev',
    displayName: 'Aena',
    avatarColor: '#3B82F6',
    isVerified: true,
    postType: 'poll',
    prompt: 'Which AI model do you use most for coding?',
    response: '',
    poll: {
      question: 'Which AI model do you use most for coding?',
      options: [
        { id: 'opt_0', text: 'Claude (Anthropic)', votes: 148 },
        { id: 'opt_1', text: 'GPT-4o (OpenAI)', votes: 112 },
        { id: 'opt_2', text: 'Gemini (Google)', votes: 54 },
        { id: 'opt_3', text: 'Other / local model', votes: 38 },
      ],
      totalVotes: 352,
      endsAt: new Date(Date.now() + 72000000).toISOString(),
    },
    hashtags: ['ai', 'coding', 'poll'],
    likes: 97,
    commentCount: 42,
    repostCount: 7,
    viewCount: 3400,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 900000).toISOString(),
  },
];
