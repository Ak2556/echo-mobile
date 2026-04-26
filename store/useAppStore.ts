import { create } from 'zustand';
import {
  ChatMessage, ChatSession, FeedItem, Comment,
  Notification, Conversation, DirectMessage, Story, User
} from '../types';

// In-memory storage shim — compatible with Expo Go (no NitroModules required).
// Swap back to react-native-mmkv after running `expo prebuild` / bare workflow.
const _map = new Map<string, string>();
const storage = {
  getString: (key: string): string | undefined => _map.get(key),
  set: (key: string, value: string): void => { _map.set(key, value); },
  clearAll: (): void => { _map.clear(); },
};

function persistGet<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function persistSet<T>(key: string, value: T) {
  storage.set(key, JSON.stringify(value));
}

// ── Mock user database ──
const MOCK_USERS: User[] = [
  { id: 'u1', username: 'aena_dev', displayName: 'Aena', avatarColor: '#3B82F6', bio: 'Building the future with code', isVerified: true, followerCount: 1243, followingCount: 89, echoCount: 47, createdAt: '2025-01-15T00:00:00Z' },
  { id: 'u2', username: 'sys_admin', displayName: 'SysOps', avatarColor: '#10B981', bio: 'DevOps engineer | Cloud native', isVerified: false, followerCount: 856, followingCount: 124, echoCount: 31, createdAt: '2025-02-01T00:00:00Z' },
  { id: 'u3', username: 'echo_fan', displayName: 'Echo Enthusiast', avatarColor: '#8B5CF6', bio: 'AI explorer and tech lover', isVerified: false, followerCount: 432, followingCount: 201, echoCount: 18, createdAt: '2025-03-10T00:00:00Z' },
  { id: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', bio: 'Machine learning researcher @ Stanford', isVerified: true, followerCount: 5621, followingCount: 312, echoCount: 92, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', bio: 'Product designer | Dark mode advocate', isVerified: true, followerCount: 3102, followingCount: 178, echoCount: 56, createdAt: '2025-02-20T00:00:00Z' },
  { id: 'u6', username: 'backend_pro', displayName: 'Backend Bob', avatarColor: '#06B6D4', bio: 'System architect | Distributed systems', isVerified: false, followerCount: 1890, followingCount: 95, echoCount: 63, createdAt: '2025-01-25T00:00:00Z' },
  { id: 'u7', username: 'crypto_kate', displayName: 'Kate Web3', avatarColor: '#EC4899', bio: 'Web3 builder | Solidity dev', isVerified: false, followerCount: 2340, followingCount: 167, echoCount: 38, createdAt: '2025-03-01T00:00:00Z' },
  { id: 'u8', username: 'data_dave', displayName: 'Data Dave', avatarColor: '#14B8A6', bio: 'Data scientist | Python enthusiast', isVerified: false, followerCount: 967, followingCount: 234, echoCount: 29, createdAt: '2025-04-01T00:00:00Z' },
];

interface AppState {
  // ── Onboarding ──
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (v: boolean) => void;

  // ── Current User ──
  userId: string;
  setUserId: (id: string) => void;
  username: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  setUsername: (n: string) => void;
  setDisplayName: (n: string) => void;
  setBio: (b: string) => void;
  setAvatarColor: (c: string) => void;

  // ── Users Database ──
  users: User[];
  getUser: (id: string) => User | undefined;
  getUserByUsername: (username: string) => User | undefined;
  searchUsers: (query: string) => User[];

  // ── Chat Sessions ──
  sessions: ChatSession[];
  currentSessionId: string | null;
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  updateSessionTitle: (id: string, title: string) => void;
  updateSessionLastMessage: (id: string, lastMessage: string, messageCount: number) => void;

  // ── Messages ──
  messagesBySession: Record<string, ChatMessage[]>;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  getMessages: (sessionId: string) => ChatMessage[];

  // ── Published Echoes ──
  publishedEchoes: FeedItem[];
  publishEcho: (echo: FeedItem) => void;
  updateEcho: (id: string, updates: Partial<FeedItem>) => void;
  deleteEcho: (id: string) => void;
  votePoll: (echoId: string, optionId: string) => void;

  // ── Likes ──
  likedIds: string[];
  toggleLike: (echoId: string) => void;
  isLiked: (echoId: string) => boolean;

  // ── Bookmarks ──
  bookmarkedIds: string[];
  toggleBookmark: (echoId: string) => void;
  isBookmarked: (echoId: string) => boolean;

  // ── Reposts ──
  repostedIds: string[];
  toggleRepost: (echoId: string) => void;
  isReposted: (echoId: string) => boolean;

  // ── Comments ──
  commentsByEcho: Record<string, Comment[]>;
  addComment: (echoId: string, comment: Comment) => void;
  deleteComment: (echoId: string, commentId: string) => void;
  likeComment: (echoId: string, commentId: string) => void;
  getComments: (echoId: string) => Comment[];

  // ── Followers / Following ──
  followingIds: string[];
  toggleFollow: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
  getFollowers: () => User[];
  getFollowing: () => User[];

  // ── Notifications ──
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadNotificationCount: () => number;

  // ── Direct Messages ──
  conversations: Conversation[];
  messagesByConversation: Record<string, DirectMessage[]>;
  sendDM: (conversationId: string, content: string) => void;
  markConversationRead: (conversationId: string) => void;
  getOrCreateConversation: (user: User) => string;
  getDMs: (conversationId: string) => DirectMessage[];
  totalUnreadDMs: () => number;

  // ── Stories ──
  stories: Story[];
  addStory: (story: Story) => void;
  markStoryViewed: (id: string) => void;
  getActiveStories: () => Story[];

  // ── Blocked Users ──
  blockedIds: string[];
  toggleBlock: (userId: string) => void;
  isBlocked: (userId: string) => boolean;

  // ── Settings ──
  hapticEnabled: boolean;
  setHapticEnabled: (v: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  privateAccount: boolean;
  setPrivateAccount: (v: boolean) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;

  // Notification preferences (granular)
  notifyLikes: boolean; setNotifyLikes: (v: boolean) => void;
  notifyComments: boolean; setNotifyComments: (v: boolean) => void;
  notifyFollows: boolean; setNotifyFollows: (v: boolean) => void;
  notifyDMs: boolean; setNotifyDMs: (v: boolean) => void;
  notifyReposts: boolean; setNotifyReposts: (v: boolean) => void;
  notifyMentions: boolean; setNotifyMentions: (v: boolean) => void;
  soundEnabled: boolean; setSoundEnabled: (v: boolean) => void;

  // Privacy
  readReceipts: boolean; setReadReceipts: (v: boolean) => void;
  onlineStatus: boolean; setOnlineStatus: (v: boolean) => void;
  dmPrivacy: 'everyone' | 'followers' | 'nobody'; setDmPrivacy: (v: 'everyone' | 'followers' | 'nobody') => void;
  activityStatus: boolean; setActivityStatus: (v: boolean) => void;

  // Appearance
  theme: 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic';
  setTheme: (v: 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic') => void;
  fontSize: 'small' | 'medium' | 'large'; setFontSize: (v: 'small' | 'medium' | 'large') => void;
  compactFeed: boolean; setCompactFeed: (v: boolean) => void;
  reduceAnimations: boolean; setReduceAnimations: (v: boolean) => void;
  accentColor: string; setAccentColor: (v: string) => void;
  showAvatars: boolean; setShowAvatars: (v: boolean) => void;
  showPreviewCards: boolean; setShowPreviewCards: (v: boolean) => void;
  pureBlackBackground: boolean; setPureBlackBackground: (v: boolean) => void;
  roundedCorners: 'small' | 'medium' | 'large'; setRoundedCorners: (v: 'small' | 'medium' | 'large') => void;

  // Chat & AI
  aiModel: 'gpt-3.5' | 'gpt-4' | 'gpt-4o'; setAiModel: (v: 'gpt-3.5' | 'gpt-4' | 'gpt-4o') => void;
  autoSaveChats: boolean; setAutoSaveChats: (v: boolean) => void;
  chatBubbleStyle: 'modern' | 'classic' | 'minimal'; setChatBubbleStyle: (v: 'modern' | 'classic' | 'minimal') => void;
  showTypingIndicator: boolean; setShowTypingIndicator: (v: boolean) => void;
  streamResponses: boolean; setStreamResponses: (v: boolean) => void;

  // Content & Feed
  autoplayStories: boolean; setAutoplayStories: (v: boolean) => void;
  dataSaver: boolean; setDataSaver: (v: boolean) => void;
  sensitiveContentFilter: boolean; setSensitiveContentFilter: (v: boolean) => void;
  contentLanguage: string; setContentLanguage: (v: string) => void;
  feedSort: 'latest' | 'popular' | 'following'; setFeedSort: (v: 'latest' | 'popular' | 'following') => void;

  // Data management
  clearChatHistory: () => void;
  clearAllBookmarks: () => void;
  clearNotifications: () => void;
  clearAllData: () => void;
  getCacheSize: () => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Onboarding ──
  hasSeenOnboarding: persistGet('hasSeenOnboarding', false),
  setHasSeenOnboarding: (v) => { persistSet('hasSeenOnboarding', v); set({ hasSeenOnboarding: v }); },

  // ── Current User ──
  userId: persistGet('userId', 'me'),
  setUserId: (id) => { persistSet('userId', id); set({ userId: id }); },
  username: persistGet('username', ''),
  displayName: persistGet('displayName', ''),
  bio: persistGet('bio', ''),
  avatarColor: persistGet('avatarColor', '#3B82F6'),
  setUsername: (n) => { persistSet('username', n); set({ username: n }); },
  setDisplayName: (n) => { persistSet('displayName', n); set({ displayName: n }); },
  setBio: (b) => { persistSet('bio', b); set({ bio: b }); },
  setAvatarColor: (c) => { persistSet('avatarColor', c); set({ avatarColor: c }); },

  // ── Users Database ──
  users: MOCK_USERS,
  getUser: (id) => MOCK_USERS.find(u => u.id === id),
  getUserByUsername: (username) => MOCK_USERS.find(u => u.username === username),
  searchUsers: (query) => {
    const q = query.toLowerCase();
    return MOCK_USERS.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
    );
  },

  // ── Chat Sessions ──
  sessions: persistGet<ChatSession[]>('sessions', []),
  currentSessionId: null,
  createSession: (title) => {
    const id = Date.now().toString();
    const now = new Date().toISOString();
    const session: ChatSession = { id, title: title || 'New Chat', lastMessage: '', messageCount: 0, createdAt: now, updatedAt: now };
    const sessions = [session, ...get().sessions];
    persistSet('sessions', sessions);
    set({ sessions, currentSessionId: id });
    return id;
  },
  deleteSession: (id) => {
    const sessions = get().sessions.filter(s => s.id !== id);
    const { [id]: _, ...rest } = get().messagesBySession;
    persistSet('sessions', sessions);
    persistSet('messagesBySession', rest);
    set({ sessions, messagesBySession: rest });
  },
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  updateSessionTitle: (id, title) => {
    const sessions = get().sessions.map(s => s.id === id ? { ...s, title } : s);
    persistSet('sessions', sessions);
    set({ sessions });
  },
  updateSessionLastMessage: (id, lastMessage, messageCount) => {
    const sessions = get().sessions.map(s =>
      s.id === id ? { ...s, lastMessage, messageCount, updatedAt: new Date().toISOString() } : s
    );
    persistSet('sessions', sessions);
    set({ sessions });
  },

  // ── Messages ──
  messagesBySession: persistGet<Record<string, ChatMessage[]>>('messagesBySession', {}),
  addMessage: (sessionId, message) => {
    const prev = get().messagesBySession;
    const msgs = [...(prev[sessionId] || []), message];
    const updated = { ...prev, [sessionId]: msgs };
    persistSet('messagesBySession', updated);
    set({ messagesBySession: updated });
  },
  updateMessage: (sessionId, messageId, content) => {
    const prev = get().messagesBySession;
    const msgs = (prev[sessionId] || []).map(m => m.id === messageId ? { ...m, content } : m);
    const updated = { ...prev, [sessionId]: msgs };
    persistSet('messagesBySession', updated);
    set({ messagesBySession: updated });
  },
  getMessages: (sessionId) => get().messagesBySession[sessionId] || [],

  // ── Published Echoes ──
  publishedEchoes: persistGet<FeedItem[]>('publishedEchoes', []),
  publishEcho: (echo) => {
    const echoes = [echo, ...get().publishedEchoes];
    persistSet('publishedEchoes', echoes);
    set({ publishedEchoes: echoes });
  },
  updateEcho: (id, updates) => {
    const echoes = get().publishedEchoes.map(e => e.id === id ? { ...e, ...updates } : e);
    persistSet('publishedEchoes', echoes);
    set({ publishedEchoes: echoes });
  },
  deleteEcho: (id) => {
    const echoes = get().publishedEchoes.filter(e => e.id !== id);
    persistSet('publishedEchoes', echoes);
    set({ publishedEchoes: echoes });
  },
  votePoll: (echoId, optionId) => {
    const echoes = get().publishedEchoes.map(e => {
      if (e.id !== echoId || !e.poll || e.poll.userVote) return e;
      const options = e.poll.options.map(o =>
        o.id === optionId ? { ...o, votes: o.votes + 1 } : o
      );
      return { ...e, poll: { ...e.poll, options, totalVotes: e.poll.totalVotes + 1, userVote: optionId } };
    });
    persistSet('publishedEchoes', echoes);
    set({ publishedEchoes: echoes });
  },

  // ── Likes ──
  likedIds: persistGet<string[]>('likedIds', []),
  toggleLike: (echoId) => {
    const ids = [...get().likedIds];
    const idx = ids.indexOf(echoId);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(echoId);
    persistSet('likedIds', ids);
    set({ likedIds: ids });
  },
  isLiked: (echoId) => get().likedIds.includes(echoId),

  // ── Bookmarks ──
  bookmarkedIds: persistGet<string[]>('bookmarkedIds', []),
  toggleBookmark: (echoId) => {
    const ids = [...get().bookmarkedIds];
    const idx = ids.indexOf(echoId);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(echoId);
    persistSet('bookmarkedIds', ids);
    set({ bookmarkedIds: ids });
  },
  isBookmarked: (echoId) => get().bookmarkedIds.includes(echoId),

  // ── Reposts ──
  repostedIds: persistGet<string[]>('repostedIds', []),
  toggleRepost: (echoId) => {
    const ids = [...get().repostedIds];
    const idx = ids.indexOf(echoId);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(echoId);
    persistSet('repostedIds', ids);
    set({ repostedIds: ids });
  },
  isReposted: (echoId) => get().repostedIds.includes(echoId),

  // ── Comments ──
  commentsByEcho: persistGet<Record<string, Comment[]>>('commentsByEcho', {}),
  addComment: (echoId, comment) => {
    const prev = get().commentsByEcho;
    const comments = [...(prev[echoId] || []), comment];
    const updated = { ...prev, [echoId]: comments };
    persistSet('commentsByEcho', updated);
    set({ commentsByEcho: updated });
  },
  deleteComment: (echoId, commentId) => {
    const prev = get().commentsByEcho;
    const comments = (prev[echoId] || []).filter(c => c.id !== commentId);
    const updated = { ...prev, [echoId]: comments };
    persistSet('commentsByEcho', updated);
    set({ commentsByEcho: updated });
  },
  likeComment: (echoId, commentId) => {
    const prev = get().commentsByEcho;
    const comments = (prev[echoId] || []).map(c =>
      c.id === commentId ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 } : c
    );
    const updated = { ...prev, [echoId]: comments };
    persistSet('commentsByEcho', updated);
    set({ commentsByEcho: updated });
  },
  getComments: (echoId) => get().commentsByEcho[echoId] || [],

  // ── Followers / Following ──
  followingIds: persistGet<string[]>('followingIds', []),
  toggleFollow: (userId) => {
    const ids = [...get().followingIds];
    const idx = ids.indexOf(userId);
    if (idx >= 0) ids.splice(idx, 1); else {
      ids.push(userId);
      // Generate follow notification
      const user = get().getUser(userId);
      if (user) {
        get().addNotification({
          id: Date.now().toString(),
          type: 'follow',
          fromUserId: 'me',
          fromUsername: get().username,
          fromDisplayName: get().displayName || get().username,
          fromAvatarColor: get().avatarColor,
          isRead: true,
          createdAt: new Date().toISOString(),
        });
      }
    }
    persistSet('followingIds', ids);
    set({ followingIds: ids });
  },
  isFollowing: (userId) => get().followingIds.includes(userId),
  getFollowers: () => {
    // Simulate some followers from mock users
    return MOCK_USERS.slice(0, 4);
  },
  getFollowing: () => {
    return MOCK_USERS.filter(u => get().followingIds.includes(u.id));
  },

  // ── Notifications ──
  notifications: persistGet<Notification[]>('notifications', [
    { id: 'n1', type: 'like', fromUserId: 'u4', fromUsername: 'ml_engineer', fromDisplayName: 'ML Maya', fromAvatarColor: '#F59E0B', targetId: '1', targetPreview: 'Write a haiku about React Native...', isRead: false, createdAt: new Date(Date.now() - 300000).toISOString() },
    { id: 'n2', type: 'follow', fromUserId: 'u5', fromUsername: 'design_lead', fromDisplayName: 'Design Dan', fromAvatarColor: '#EF4444', isRead: false, createdAt: new Date(Date.now() - 600000).toISOString() },
    { id: 'n3', type: 'comment', fromUserId: 'u2', fromUsername: 'sys_admin', fromDisplayName: 'SysOps', fromAvatarColor: '#10B981', targetId: '2', targetPreview: 'Great insight on pgvector!', isRead: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'n4', type: 'repost', fromUserId: 'u7', fromUsername: 'crypto_kate', fromDisplayName: 'Kate Web3', fromAvatarColor: '#EC4899', targetId: '3', targetPreview: 'What is the fastest mobile framework?', isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'n5', type: 'like', fromUserId: 'u6', fromUsername: 'backend_pro', fromDisplayName: 'Backend Bob', fromAvatarColor: '#06B6D4', targetId: '1', targetPreview: 'Write a haiku about React Native...', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 'n6', type: 'mention', fromUserId: 'u3', fromUsername: 'echo_fan', fromDisplayName: 'Echo Enthusiast', fromAvatarColor: '#8B5CF6', targetId: '5', targetPreview: 'mentioned you in a comment', isRead: true, createdAt: new Date(Date.now() - 14400000).toISOString() },
    { id: 'n7', type: 'follow', fromUserId: 'u8', fromUsername: 'data_dave', fromDisplayName: 'Data Dave', fromAvatarColor: '#14B8A6', isRead: true, createdAt: new Date(Date.now() - 28800000).toISOString() },
  ]),
  addNotification: (n) => {
    const notifications = [n, ...get().notifications];
    persistSet('notifications', notifications);
    set({ notifications });
  },
  markNotificationRead: (id) => {
    const notifications = get().notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    persistSet('notifications', notifications);
    set({ notifications });
  },
  markAllNotificationsRead: () => {
    const notifications = get().notifications.map(n => ({ ...n, isRead: true }));
    persistSet('notifications', notifications);
    set({ notifications });
  },
  unreadNotificationCount: () => get().notifications.filter(n => !n.isRead).length,

  // ── Direct Messages ──
  conversations: persistGet<Conversation[]>('conversations', [
    { id: 'conv1', userId: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', isVerified: true, lastMessage: 'That transformer explanation was really helpful!', lastMessageAt: new Date(Date.now() - 1800000).toISOString(), unreadCount: 2 },
    { id: 'conv2', userId: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', isVerified: true, lastMessage: 'Love the dark mode tips 🌙', lastMessageAt: new Date(Date.now() - 7200000).toISOString(), unreadCount: 0 },
    { id: 'conv3', userId: 'u2', username: 'sys_admin', displayName: 'SysOps', avatarColor: '#10B981', isVerified: false, lastMessage: 'Can you help with pgvector indexing?', lastMessageAt: new Date(Date.now() - 86400000).toISOString(), unreadCount: 1 },
  ]),
  messagesByConversation: persistGet<Record<string, DirectMessage[]>>('messagesByConversation', {
    conv1: [
      { id: 'dm1', senderId: 'u4', content: 'Hey! Loved your echo about React Native performance', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
      { id: 'dm2', senderId: 'me', content: 'Thanks Maya! Reanimated v4 is incredible', isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'dm3', senderId: 'u4', content: 'That transformer explanation was really helpful!', isRead: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
      { id: 'dm4', senderId: 'u4', content: 'Would love to collaborate on an AI post sometime', isRead: false, createdAt: new Date(Date.now() - 1700000).toISOString() },
    ],
    conv2: [
      { id: 'dm5', senderId: 'me', content: 'Hey Dan, what do you think of OLED-optimized designs?', isRead: true, createdAt: new Date(Date.now() - 14400000).toISOString() },
      { id: 'dm6', senderId: 'u5', content: 'Love the dark mode tips 🌙', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
    ],
    conv3: [
      { id: 'dm7', senderId: 'u2', content: 'Can you help with pgvector indexing?', isRead: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
    ],
  }),
  sendDM: (conversationId, content) => {
    const msg: DirectMessage = { id: Date.now().toString(), senderId: 'me', content, isRead: true, createdAt: new Date().toISOString() };
    const prev = get().messagesByConversation;
    const msgs = [...(prev[conversationId] || []), msg];
    const updated = { ...prev, [conversationId]: msgs };
    persistSet('messagesByConversation', updated);
    // Update conversation
    const conversations = get().conversations.map(c =>
      c.id === conversationId ? { ...c, lastMessage: content, lastMessageAt: msg.createdAt } : c
    );
    persistSet('conversations', conversations);
    set({ messagesByConversation: updated, conversations });
  },
  markConversationRead: (conversationId) => {
    const conversations = get().conversations.map(c =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    );
    const prev = get().messagesByConversation;
    const msgs = (prev[conversationId] || []).map(m => ({ ...m, isRead: true }));
    const updated = { ...prev, [conversationId]: msgs };
    persistSet('conversations', conversations);
    persistSet('messagesByConversation', updated);
    set({ conversations, messagesByConversation: updated });
  },
  getOrCreateConversation: (user) => {
    const existing = get().conversations.find(c => c.userId === user.id);
    if (existing) return existing.id;
    const id = `conv_${Date.now()}`;
    const conv: Conversation = {
      id, userId: user.id, username: user.username, displayName: user.displayName,
      avatarColor: user.avatarColor, isVerified: user.isVerified,
      lastMessage: '', lastMessageAt: new Date().toISOString(), unreadCount: 0,
    };
    const conversations = [conv, ...get().conversations];
    persistSet('conversations', conversations);
    set({ conversations });
    return id;
  },
  getDMs: (conversationId) => get().messagesByConversation[conversationId] || [],
  totalUnreadDMs: () => get().conversations.reduce((sum, c) => sum + c.unreadCount, 0),

  // ── Stories ──
  stories: persistGet<Story[]>('stories', [
    { id: 's1', userId: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', prompt: 'Explain gradient descent in one sentence', response: 'Gradient descent iteratively adjusts parameters by moving in the direction that most reduces the error.', viewCount: 89, isViewed: false, createdAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 82800000).toISOString() },
    { id: 's2', userId: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', prompt: 'Best color palette for fintech apps?', response: 'Deep navy (#1a1f36) with bright teal (#00d4aa) accents. Use warm grays for text and subtle green for positive values.', viewCount: 156, isViewed: false, createdAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 79200000).toISOString() },
    { id: 's3', userId: 'u7', username: 'crypto_kate', displayName: 'Kate Web3', avatarColor: '#EC4899', prompt: 'Explain zero knowledge proofs simply', response: 'Imagine proving you know a password without ever revealing it — that\'s ZKP. You convince the verifier of truth without sharing the underlying data.', viewCount: 234, isViewed: false, createdAt: new Date(Date.now() - 1800000).toISOString(), expiresAt: new Date(Date.now() + 84600000).toISOString() },
    { id: 's4', userId: 'u1', username: 'aena_dev', displayName: 'Aena', avatarColor: '#3B82F6', prompt: 'Best Expo Router tips?', response: 'Use typed routes for safety, parallel routes for layouts, and group routes with (parentheses) for shared UI without URL segments.', viewCount: 312, isViewed: true, createdAt: new Date(Date.now() - 10800000).toISOString(), expiresAt: new Date(Date.now() + 75600000).toISOString() },
  ]),
  addStory: (story) => {
    const stories = [story, ...get().stories];
    persistSet('stories', stories);
    set({ stories });
  },
  markStoryViewed: (id) => {
    const stories = get().stories.map(s => s.id === id ? { ...s, isViewed: true } : s);
    persistSet('stories', stories);
    set({ stories });
  },
  getActiveStories: () => get().stories.filter(s => new Date(s.expiresAt) > new Date()),

  // ── Blocked Users ──
  blockedIds: persistGet<string[]>('blockedIds', []),
  toggleBlock: (userId) => {
    const ids = [...get().blockedIds];
    const idx = ids.indexOf(userId);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(userId);
    persistSet('blockedIds', ids);
    set({ blockedIds: ids });
  },
  isBlocked: (userId) => get().blockedIds.includes(userId),

  // ── Settings ──
  hapticEnabled: persistGet('hapticEnabled', true),
  setHapticEnabled: (v) => { persistSet('hapticEnabled', v); set({ hapticEnabled: v }); },
  notificationsEnabled: persistGet('notificationsEnabled', true),
  setNotificationsEnabled: (v) => { persistSet('notificationsEnabled', v); set({ notificationsEnabled: v }); },
  privateAccount: persistGet('privateAccount', false),
  setPrivateAccount: (v) => { persistSet('privateAccount', v); set({ privateAccount: v }); },
  darkMode: persistGet('darkMode', true),
  setDarkMode: (v) => { persistSet('darkMode', v); set({ darkMode: v }); },

  // Notification preferences
  notifyLikes: persistGet('notifyLikes', true),
  setNotifyLikes: (v) => { persistSet('notifyLikes', v); set({ notifyLikes: v }); },
  notifyComments: persistGet('notifyComments', true),
  setNotifyComments: (v) => { persistSet('notifyComments', v); set({ notifyComments: v }); },
  notifyFollows: persistGet('notifyFollows', true),
  setNotifyFollows: (v) => { persistSet('notifyFollows', v); set({ notifyFollows: v }); },
  notifyDMs: persistGet('notifyDMs', true),
  setNotifyDMs: (v) => { persistSet('notifyDMs', v); set({ notifyDMs: v }); },
  notifyReposts: persistGet('notifyReposts', true),
  setNotifyReposts: (v) => { persistSet('notifyReposts', v); set({ notifyReposts: v }); },
  notifyMentions: persistGet('notifyMentions', true),
  setNotifyMentions: (v) => { persistSet('notifyMentions', v); set({ notifyMentions: v }); },
  soundEnabled: persistGet('soundEnabled', true),
  setSoundEnabled: (v) => { persistSet('soundEnabled', v); set({ soundEnabled: v }); },

  // Privacy
  readReceipts: persistGet('readReceipts', true),
  setReadReceipts: (v) => { persistSet('readReceipts', v); set({ readReceipts: v }); },
  onlineStatus: persistGet('onlineStatus', true),
  setOnlineStatus: (v) => { persistSet('onlineStatus', v); set({ onlineStatus: v }); },
  dmPrivacy: persistGet<'everyone' | 'followers' | 'nobody'>('dmPrivacy', 'everyone'),
  setDmPrivacy: (v) => { persistSet('dmPrivacy', v); set({ dmPrivacy: v }); },
  activityStatus: persistGet('activityStatus', true),
  setActivityStatus: (v) => { persistSet('activityStatus', v); set({ activityStatus: v }); },

  // Appearance
  theme: persistGet<'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic'>('theme', 'midnight'),
  setTheme: (v) => { persistSet('theme', v); set({ theme: v }); },
  fontSize: persistGet<'small' | 'medium' | 'large'>('fontSize', 'medium'),
  setFontSize: (v) => { persistSet('fontSize', v); set({ fontSize: v }); },
  compactFeed: persistGet('compactFeed', false),
  setCompactFeed: (v) => { persistSet('compactFeed', v); set({ compactFeed: v }); },
  reduceAnimations: persistGet('reduceAnimations', false),
  setReduceAnimations: (v) => { persistSet('reduceAnimations', v); set({ reduceAnimations: v }); },
  accentColor: persistGet('accentColor', '#3B82F6'),
  setAccentColor: (v) => { persistSet('accentColor', v); set({ accentColor: v }); },
  showAvatars: persistGet('showAvatars', true),
  setShowAvatars: (v) => { persistSet('showAvatars', v); set({ showAvatars: v }); },
  showPreviewCards: persistGet('showPreviewCards', true),
  setShowPreviewCards: (v) => { persistSet('showPreviewCards', v); set({ showPreviewCards: v }); },
  pureBlackBackground: persistGet('pureBlackBackground', true),
  setPureBlackBackground: (v) => { persistSet('pureBlackBackground', v); set({ pureBlackBackground: v }); },
  roundedCorners: persistGet<'small' | 'medium' | 'large'>('roundedCorners', 'medium'),
  setRoundedCorners: (v) => { persistSet('roundedCorners', v); set({ roundedCorners: v }); },

  // Chat & AI
  aiModel: persistGet<'gpt-3.5' | 'gpt-4' | 'gpt-4o'>('aiModel', 'gpt-3.5'),
  setAiModel: (v) => { persistSet('aiModel', v); set({ aiModel: v }); },
  autoSaveChats: persistGet('autoSaveChats', true),
  setAutoSaveChats: (v) => { persistSet('autoSaveChats', v); set({ autoSaveChats: v }); },
  chatBubbleStyle: persistGet<'modern' | 'classic' | 'minimal'>('chatBubbleStyle', 'modern'),
  setChatBubbleStyle: (v) => { persistSet('chatBubbleStyle', v); set({ chatBubbleStyle: v }); },
  showTypingIndicator: persistGet('showTypingIndicator', true),
  setShowTypingIndicator: (v) => { persistSet('showTypingIndicator', v); set({ showTypingIndicator: v }); },
  streamResponses: persistGet('streamResponses', true),
  setStreamResponses: (v) => { persistSet('streamResponses', v); set({ streamResponses: v }); },

  // Content & Feed
  autoplayStories: persistGet('autoplayStories', true),
  setAutoplayStories: (v) => { persistSet('autoplayStories', v); set({ autoplayStories: v }); },
  dataSaver: persistGet('dataSaver', false),
  setDataSaver: (v) => { persistSet('dataSaver', v); set({ dataSaver: v }); },
  sensitiveContentFilter: persistGet('sensitiveContentFilter', true),
  setSensitiveContentFilter: (v) => { persistSet('sensitiveContentFilter', v); set({ sensitiveContentFilter: v }); },
  contentLanguage: persistGet('contentLanguage', 'English'),
  setContentLanguage: (v) => { persistSet('contentLanguage', v); set({ contentLanguage: v }); },
  feedSort: persistGet<'latest' | 'popular' | 'following'>('feedSort', 'latest'),
  setFeedSort: (v) => { persistSet('feedSort', v); set({ feedSort: v }); },

  // Data management
  clearChatHistory: () => {
    persistSet('sessions', []);
    persistSet('messagesBySession', {});
    set({ sessions: [], messagesBySession: {}, currentSessionId: null });
  },
  clearAllBookmarks: () => {
    persistSet('bookmarkedIds', []);
    set({ bookmarkedIds: [] });
  },
  clearNotifications: () => {
    persistSet('notifications', []);
    set({ notifications: [] });
  },
  clearAllData: () => {
    storage.clearAll();
    set({
      sessions: [], messagesBySession: {}, currentSessionId: null,
      publishedEchoes: [], likedIds: [], bookmarkedIds: [], repostedIds: [],
      commentsByEcho: {}, followingIds: [], notifications: [],
      conversations: [], messagesByConversation: {},
      stories: [], blockedIds: [],
      hasSeenOnboarding: false, username: '', displayName: '', bio: '',
      avatarColor: '#3B82F6',
    });
  },
  getCacheSize: () => {
    const keys = ['sessions', 'messagesBySession', 'publishedEchoes', 'notifications',
      'conversations', 'messagesByConversation', 'commentsByEcho', 'stories'];
    let total = 0;
    for (const k of keys) {
      const raw = storage.getString(k);
      if (raw) total += raw.length;
    }
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  },
}));
