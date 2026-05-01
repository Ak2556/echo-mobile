import { FeedItem, Comment, Notification, Conversation, DirectMessage, Story, User } from '../../types';
import { persistGet, persistSet } from '../persist';
import {
  MOCK_USERS,
  SEED_NOTIFICATIONS,
  SEED_CONVERSATIONS,
  SEED_DMS,
  SEED_STORIES,
} from '../../lib/mockData';

// Cross-slice dependency: toggleFollow reads auth fields from the shared store
interface AuthFields {
  username: string;
  displayName: string;
  avatarColor: string;
}

export interface SocialSlice {
  // ── Users Database ──
  users: User[];
  getUser: (id: string) => User | undefined;
  getUserByUsername: (username: string) => User | undefined;
  searchUsers: (query: string) => User[];

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
}

export function createSocialSlice(
  set: (partial: object) => void,
  get: () => SocialSlice & AuthFields,
): SocialSlice {
  return {
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
      if (idx >= 0) {
        ids.splice(idx, 1);
      } else {
        ids.push(userId);
        // Generate a follow notification (visible to the current user in their feed)
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
    getFollowers: () => MOCK_USERS.slice(0, 4),
    getFollowing: () => MOCK_USERS.filter(u => get().followingIds.includes(u.id)),

    // ── Notifications ──
    notifications: persistGet<Notification[]>('notifications', SEED_NOTIFICATIONS),
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
    conversations: persistGet<Conversation[]>('conversations', SEED_CONVERSATIONS),
    messagesByConversation: persistGet<Record<string, DirectMessage[]>>('messagesByConversation', SEED_DMS),
    sendDM: (conversationId, content) => {
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      const prev = get().messagesByConversation;
      const msgs = [...(prev[conversationId] || []), msg];
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastMessage: content, lastMessageAt: msg.createdAt } : c
      );
      persistSet('messagesByConversation', updatedMsgs);
      persistSet('conversations', conversations);
      set({ messagesByConversation: updatedMsgs, conversations });
    },
    markConversationRead: (conversationId) => {
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      const prev = get().messagesByConversation;
      const msgs = (prev[conversationId] || []).map(m => ({ ...m, isRead: true }));
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      persistSet('conversations', conversations);
      persistSet('messagesByConversation', updatedMsgs);
      set({ conversations, messagesByConversation: updatedMsgs });
    },
    getOrCreateConversation: (user) => {
      const existing = get().conversations.find(c => c.userId === user.id);
      if (existing) return existing.id;
      const id = `conv_${Date.now()}`;
      const conv: Conversation = {
        id,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        isVerified: user.isVerified,
        lastMessage: '',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
      };
      const conversations = [conv, ...get().conversations];
      persistSet('conversations', conversations);
      set({ conversations });
      return id;
    },
    getDMs: (conversationId) => get().messagesByConversation[conversationId] || [],
    totalUnreadDMs: () => get().conversations.reduce((sum, c) => sum + c.unreadCount, 0),

    // ── Stories ──
    stories: persistGet<Story[]>('stories', SEED_STORIES),
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
  };
}
