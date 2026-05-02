import { FeedItem, User } from '../types';

export const ONBOARDING_INTERESTS = [
  'AI',
  'Build in Public',
  'Design',
  'React Native',
  'Startups',
  'Productivity',
  'Writing',
  'Machine Learning',
] as const;

export const POSTING_INTENTS = [
  { key: 'chat', title: 'Start a conversation', subtitle: 'Ask Echo something worth turning into a post later.' },
  { key: 'discover', title: 'Explore top Echoes', subtitle: 'See what strong AI-native posts look like first.' },
  { key: 'post', title: 'Draft your first Echo', subtitle: 'Publish a thought or conversation right away.' },
] as const;

export const EDITORIAL_ACTIONS = [
  { key: 'clarify', label: 'Make clearer' },
  { key: 'shorten', label: 'Shorten' },
  { key: 'insight', label: 'Turn into insight' },
  { key: 'hook', label: 'Add hook' },
  { key: 'privacy', label: 'Remove private details' },
] as const;

export function normalizeTopic(topic: string) {
  return topic.replace(/^#/, '').trim();
}

export function titleCase(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function inferTopics(item: Pick<FeedItem, 'hashtags' | 'prompt' | 'response'>): string[] {
  const tagTopics = (item.hashtags ?? []).map(normalizeTopic).filter(Boolean);
  if (tagTopics.length > 0) return [...new Set(tagTopics)].slice(0, 4);

  const source = `${item.prompt} ${item.response}`.toLowerCase();
  const keywords = [
    'ai',
    'react native',
    'design',
    'productivity',
    'machine learning',
    'startup',
    'crypto',
    'writing',
    'database',
    'video',
  ];
  return keywords.filter(keyword => source.includes(keyword)).map(titleCase).slice(0, 4);
}

export function buildEditorialTitle(prompt: string, response: string) {
  const trimmedPrompt = prompt.trim().replace(/[?.!]+$/, '');
  if (trimmedPrompt.length > 0 && trimmedPrompt.length <= 64) {
    return trimmedPrompt;
  }
  const firstSentence = response.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  const compact = firstSentence.trim();
  if (compact.length > 0) {
    return compact.slice(0, 70);
  }
  return 'Untitled Echo';
}

export function summarizeConversationContext(prompt: string, response: string) {
  const responsePreview = response.trim().slice(0, 120);
  if (!responsePreview) return 'Started from a direct chat with Echo.';
  return `Started with "${prompt.trim().slice(0, 48)}" and refined into a public takeaway.`;
}

export function applyEditorialAction(action: string, text: string, prompt: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;

  switch (action) {
    case 'clarify':
      return trimmed
        .replace(/\s+/g, ' ')
        .replace(/\bi\b/g, 'I')
        .replace(/^./, c => c.toUpperCase());
    case 'shorten': {
      const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
      return sentences.slice(0, 2).join(' ').slice(0, 280);
    }
    case 'insight':
      return `Takeaway: ${trimmed}`;
    case 'hook':
      return `I asked Echo "${prompt.trim().slice(0, 70)}" and this was the part worth sharing:\n\n${trimmed}`;
    case 'privacy':
      return trimmed
        .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '[redacted email]')
        .replace(/\b\d{10,}\b/g, '[redacted number]');
    default:
      return text;
  }
}

export function evaluatePublishChecklist(input: {
  title: string;
  response: string;
  authorNote: string;
}) {
  const title = input.title.trim();
  const response = input.response.trim();
  const authorNote = input.authorNote.trim();
  return {
    clarity: title.length >= 6 && response.length >= 80,
    relevance: title.length > 0 && (authorNote.length > 0 || response.length >= 120),
    privacy: !/\b[\w.+-]+@[\w.-]+\.\w+\b|\b\d{10,}\b/.test(`${title} ${response} ${authorNote}`),
    completeness: response.length >= 40,
  };
}

export function deriveTopicFeed(feed: FeedItem[]) {
  const counts = new Map<string, number>();
  feed.forEach(item => {
    inferTopics(item).forEach(topic => {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }))
    .slice(0, 8);
}

export function groupDiscovery(feed: FeedItem[], interests: string[], followingIds: string[]) {
  const ranked = [...feed].sort((a, b) => (b.likes + b.repostCount + b.commentCount) - (a.likes + a.repostCount + a.commentCount));
  const forYou = ranked.filter(item => {
    const topics = inferTopics(item).map(topic => topic.toLowerCase());
    return interests.some(interest => topics.includes(interest.toLowerCase()));
  }).slice(0, 6);
  const rising = [...feed]
    .sort((a, b) => ((b.commentCount * 2) + b.repostCount + b.likes) - ((a.commentCount * 2) + a.repostCount + a.likes))
    .slice(0, 6);
  const conversationStarters = [...feed]
    .filter(item => item.postType === 'text' && item.prompt.length > 30)
    .slice(0, 6);
  const following = feed.filter(item => followingIds.includes(item.userId)).slice(0, 6);

  return { forYou, rising, conversationStarters, following };
}

export function buildCreatorProfile(user: Pick<User, 'displayName' | 'bio' | 'createdAt'>, feed: FeedItem[]) {
  const topics = deriveTopicFeed(feed).map(item => item.topic);
  const strongestTopic = topics[0] ?? 'AI conversations';
  const pinned = [...feed]
    .sort((a, b) => (b.likes + b.commentCount + b.repostCount) - (a.likes + a.commentCount + a.repostCount))
    .slice(0, 2);
  const series = [...new Set(feed.map(item => item.series).filter(Boolean) as string[])].slice(0, 3);
  const joinedYear = new Date(user.createdAt).getFullYear();

  return {
    headline: user.bio || `Sharing ideas about ${strongestTopic.toLowerCase()} on Echo.`,
    topics: topics.slice(0, 5),
    pinned,
    series,
    joinedYear,
  };
}

export function buildSearchBuckets(feed: FeedItem[], users: User[], query: string) {
  const q = query.toLowerCase().trim();
  const topicMatches = deriveTopicFeed(feed).filter(item => item.topic.toLowerCase().includes(q));
  const userMatches = users.filter(user =>
    user.username.toLowerCase().includes(q) || user.displayName.toLowerCase().includes(q)
  );
  const echoMatches = feed.filter(item =>
    item.prompt.toLowerCase().includes(q) ||
    item.response.toLowerCase().includes(q) ||
    item.username.toLowerCase().includes(q) ||
    inferTopics(item).some(topic => topic.toLowerCase().includes(q))
  );
  const promptMatches = echoMatches.filter(item => item.prompt.toLowerCase().includes(q));
  const mediaMatches = echoMatches.filter(item => item.postType === 'photo' || item.postType === 'video');

  return { topicMatches, userMatches, echoMatches, promptMatches, mediaMatches };
}
