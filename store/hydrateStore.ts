import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from './useAppStore';

const PERSISTED_KEYS = [
  'hasSeenOnboarding', 'userId', 'username', 'displayName', 'bio', 'avatarColor',
  'sessions', 'messagesBySession', 'publishedEchoes',
  'likedIds', 'bookmarkedIds', 'repostedIds', 'followingIds',
  'commentsByEcho', 'notifications', 'conversations', 'messagesByConversation',
  'stories', 'blockedIds',
  'theme', 'fontSize', 'feedSort', 'compactFeed', 'reduceAnimations',
  'accentColor', 'showAvatars', 'showPreviewCards', 'pureBlackBackground', 'roundedCorners',
  'hapticEnabled', 'notificationsEnabled', 'privateAccount', 'darkMode',
  'notifyLikes', 'notifyComments', 'notifyFollows', 'notifyDMs',
  'notifyReposts', 'notifyMentions', 'soundEnabled',
  'readReceipts', 'onlineStatus', 'dmPrivacy', 'activityStatus',
  'aiModel', 'autoSaveChats', 'chatBubbleStyle', 'showTypingIndicator', 'streamResponses',
  'autoplayStories', 'dataSaver', 'sensitiveContentFilter', 'contentLanguage',
] as const;

export async function hydrateStore(): Promise<void> {
  const pairs = await AsyncStorage.multiGet(PERSISTED_KEYS as unknown as string[]);
  const patch: Record<string, unknown> = {};
  for (const [key, raw] of pairs) {
    if (!raw) continue;
    try { patch[key] = JSON.parse(raw); } catch {}
  }
  if (Object.keys(patch).length > 0) {
    useAppStore.setState(patch as unknown as Parameters<typeof useAppStore.setState>[0]);
  }
}
