// Helpers for building Poll objects from AI tool args and publishing them
// as a poll-type echo via the Zustand store.

import { Poll, PollOption, FeedItem } from '../types';
import { useAppStore } from '../store/useAppStore';

const VALID_DURATIONS: Record<string, number> = {
  '1h': 1, '6h': 6, '12h': 12, '24h': 24, '1d': 24,
  '3d': 72, '7d': 168, '1w': 168,
};

export interface PollArgs {
  question?: unknown;
  options?: unknown;
  duration?: unknown;
  hashtags?: unknown;
}

export interface BuiltPoll {
  question: string;
  poll: Poll;
  hashtags: string[];
}

export function buildPollFromArgs(args: PollArgs): BuiltPoll {
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!question) throw new Error('Poll question is required');

  const rawOptions = Array.isArray(args.options) ? args.options : [];
  const opts = rawOptions
    .map((o): string => typeof o === 'string' ? o.trim() : (o && typeof o === 'object' && typeof (o as any).text === 'string' ? (o as any).text.trim() : ''))
    .filter(Boolean)
    .slice(0, 4);
  if (opts.length < 2) throw new Error('A poll needs at least 2 options');

  const options: PollOption[] = opts.map((text, i) => ({ id: `opt_${i}`, text, votes: 0 }));

  const durKey = typeof args.duration === 'string' ? args.duration.trim().toLowerCase() : '24h';
  const hours = VALID_DURATIONS[durKey] ?? 24;
  const endsAt = new Date(Date.now() + hours * 3600_000).toISOString();

  const hashtags = Array.isArray(args.hashtags)
    ? args.hashtags.map((t): string => typeof t === 'string' ? t.replace(/^#/, '').trim() : '').filter(Boolean).slice(0, 5)
    : [];

  return {
    question,
    poll: { question, options, totalVotes: 0, endsAt },
    hashtags,
  };
}

export interface PublishedPollResult {
  id: string;
  question: string;
  options: string[];
  endsAt?: string;
}

// Publishes the poll into the Zustand store (and into the local feed).
// Returns metadata so the AI can confirm in the next message.
export function publishPollFromArgs(args: PollArgs): PublishedPollResult {
  const built = buildPollFromArgs(args);
  const store = useAppStore.getState();
  const id = `poll_${Date.now()}`;

  const echo: FeedItem = {
    id,
    userId: store.userId || 'me',
    username: store.username || 'anonymous',
    displayName: store.displayName || store.username || 'anonymous',
    avatarColor: store.avatarColor || '#6366F1',
    avatarUrl: store.avatarUrl || undefined,
    isVerified: false,
    prompt: built.question,
    response: '',
    likes: 0,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    repostCount: 0,
    commentCount: 0,
    viewCount: 0,
    hashtags: built.hashtags,
    createdAt: new Date().toISOString(),
    postOrigin: 'chat',
    postType: 'poll',
    poll: built.poll,
  };

  store.publishEcho(echo);
  return {
    id,
    question: built.question,
    options: built.poll.options.map(o => o.text),
    endsAt: built.poll.endsAt,
  };
}
