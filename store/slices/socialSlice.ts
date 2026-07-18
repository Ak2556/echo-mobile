import { FeedItem, Comment, Notification, Conversation, DirectMessage, Story, User } from '../../types';
import { persistGet, persistSet } from '../persist';

// Cross-slice dependency: toggleFollow reads auth fields from the shared store
interface AuthFields {
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string;
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
  sendDMImage: (conversationId: string, uri: string) => void;
  sendDMLink: (conversationId: string, url: string, title?: string, subtitle?: string) => void;
  shareContactInDM: (conversationId: string, user: User | Conversation, intro?: string) => void;
  shareEchoInDM: (conversationId: string, echo: FeedItem, intro?: string) => void;
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

  // ── Muted Users / Threads ──
  mutedIds: string[];
  toggleMute: (userId: string) => void;
  isMuted: (userId: string) => boolean;
  mutedThreadIds: string[];
  toggleThreadMute: (threadId: string) => void;
  isThreadMuted: (threadId: string) => boolean;

  // ── Pinned echoes (own profile) ──
  pinnedEchoIds: string[];
  togglePinEcho: (echoId: string) => void;
  isPinned: (echoId: string) => boolean;

  // ── Bookmark collections ──
  bookmarkCollections: { id: string; name: string }[];
  bookmarkCollectionByEchoId: Record<string, string>; // echoId → collectionId
  createBookmarkCollection: (name: string) => string;
  renameBookmarkCollection: (id: string, name: string) => void;
  deleteBookmarkCollection: (id: string) => void;
  setBookmarkCollection: (echoId: string, collectionId: string | null) => void;

  // ── Reset (call on sign-out) ──
  resetSocialData: () => void;
}

export function createSocialSlice(
  set: (partial: object) => void,
  get: () => SocialSlice & AuthFields,
): SocialSlice {
  return {
    // ── Users Database (local-only fallback; remote mode uses Supabase queries) ──
    users: [],
    getUser: (_id) => undefined,
    getUserByUsername: (_username) => undefined,
    searchUsers: (_query) => [],

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
            fromAvatarUrl: get().avatarUrl || undefined,
            isRead: true,
            createdAt: new Date().toISOString(),
          });
        }
      }
      persistSet('followingIds', ids);
      set({ followingIds: ids });
    },
    isFollowing: (userId) => get().followingIds.includes(userId),
    getFollowers: () => [] as User[],
    getFollowing: () => [] as User[],

    // ── Notifications ──
    notifications: persistGet<Notification[]>('notifications', []),
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
    conversations: persistGet<Conversation[]>('conversations', []),
    messagesByConversation: persistGet<Record<string, DirectMessage[]>>('messagesByConversation', {}),
    sendDM: (conversationId, content) => {
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content,
        kind: 'text',
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
    sendDMImage: (conversationId, uri) => {
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content: '',
        kind: 'image',
        mediaUrl: uri,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      const prev = get().messagesByConversation;
      const msgs = [...(prev[conversationId] || []), msg];
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastMessage: 'Photo', lastMessageAt: msg.createdAt } : c
      );
      persistSet('messagesByConversation', updatedMsgs);
      persistSet('conversations', conversations);
      set({ messagesByConversation: updatedMsgs, conversations });
    },
    sendDMLink: (conversationId, url, title, subtitle) => {
      const cleanUrl = url.trim();
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content: cleanUrl,
        kind: 'link',
        linkUrl: cleanUrl,
        linkTitle: title ?? cleanUrl,
        linkSubtitle: subtitle,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      const prev = get().messagesByConversation;
      const msgs = [...(prev[conversationId] || []), msg];
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastMessage: title ?? cleanUrl, lastMessageAt: msg.createdAt } : c
      );
      persistSet('messagesByConversation', updatedMsgs);
      persistSet('conversations', conversations);
      set({ messagesByConversation: updatedMsgs, conversations });
    },
    shareContactInDM: (conversationId, user, intro) => {
      const username = user.username;
      const displayName = user.displayName;
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content: intro?.trim() || `Contact: ${displayName}`,
        kind: 'contact',
        contactUserId: 'userId' in user ? user.userId : user.id,
        contactUsername: username,
        contactDisplayName: displayName,
        contactAvatarColor: user.avatarColor,
        contactAvatarUrl: user.avatarUrl,
        linkTitle: displayName,
        linkSubtitle: `@${username}`,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      const prev = get().messagesByConversation;
      const msgs = [...(prev[conversationId] || []), msg];
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastMessage: `Contact: ${displayName}`, lastMessageAt: msg.createdAt } : c
      );
      persistSet('messagesByConversation', updatedMsgs);
      persistSet('conversations', conversations);
      set({ messagesByConversation: updatedMsgs, conversations });
    },
    shareEchoInDM: (conversationId, echo, intro) => {
      const body = intro?.trim() || `Thought you'd like this Echo from @${echo.username}.`;
      const msg: DirectMessage = {
        id: Date.now().toString(),
        senderId: 'me',
        content: body,
        kind: 'echo',
        isRead: true,
        createdAt: new Date().toISOString(),
        sharedEchoId: echo.id,
        sharedEchoTitle: echo.editorialTitle || echo.prompt,
        sharedEchoPreview: echo.response || echo.prompt,
        sharedEchoAuthor: echo.displayName || echo.username,
      };
      const prev = get().messagesByConversation;
      const msgs = [...(prev[conversationId] || []), msg];
      const updatedMsgs = { ...prev, [conversationId]: msgs };
      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, lastMessage: body, lastMessageAt: msg.createdAt } : c
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
      if (existing) {
        const next: Conversation = {
          ...existing,
          username: user.username || existing.username,
          displayName: user.displayName || existing.displayName,
          avatarColor: user.avatarColor || existing.avatarColor,
          avatarUrl: user.avatarUrl || existing.avatarUrl,
          isVerified: user.isVerified ?? existing.isVerified,
        };
        if (next.avatarUrl !== existing.avatarUrl || next.displayName !== existing.displayName || next.username !== existing.username || next.avatarColor !== existing.avatarColor || next.isVerified !== existing.isVerified) {
          const conversations = get().conversations.map(c => c.id === existing.id ? next : c);
          persistSet('conversations', conversations);
          set({ conversations });
        }
        return existing.id;
      }
      const id = `conv_${Date.now()}`;
      const conv: Conversation = {
        id,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl,
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
    stories: persistGet<Story[]>('stories', []),
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

    // ── Muted Users / Threads ──
    mutedIds: persistGet<string[]>('mutedIds', []),
    toggleMute: (userId) => {
      const ids = [...get().mutedIds];
      const idx = ids.indexOf(userId);
      if (idx >= 0) ids.splice(idx, 1); else ids.push(userId);
      persistSet('mutedIds', ids);
      set({ mutedIds: ids });
    },
    isMuted: (userId) => get().mutedIds.includes(userId),
    mutedThreadIds: persistGet<string[]>('mutedThreadIds', []),
    toggleThreadMute: (threadId) => {
      const ids = [...get().mutedThreadIds];
      const idx = ids.indexOf(threadId);
      if (idx >= 0) ids.splice(idx, 1); else ids.push(threadId);
      persistSet('mutedThreadIds', ids);
      set({ mutedThreadIds: ids });
    },
    isThreadMuted: (threadId) => get().mutedThreadIds.includes(threadId),

    // ── Bookmark collections ──
    bookmarkCollections: persistGet<{ id: string; name: string }[]>('bookmarkCollections', []),
    bookmarkCollectionByEchoId: persistGet<Record<string, string>>('bookmarkCollectionByEchoId', {}),
    createBookmarkCollection: (name) => {
      const id = `bc_${Date.now()}`;
      const list = [...get().bookmarkCollections, { id, name: name.trim() || 'Untitled' }];
      persistSet('bookmarkCollections', list);
      set({ bookmarkCollections: list });
      return id;
    },
    renameBookmarkCollection: (id, name) => {
      const list = get().bookmarkCollections.map(c => c.id === id ? { ...c, name } : c);
      persistSet('bookmarkCollections', list);
      set({ bookmarkCollections: list });
    },
    deleteBookmarkCollection: (id) => {
      const list = get().bookmarkCollections.filter(c => c.id !== id);
      const map = { ...get().bookmarkCollectionByEchoId };
      for (const k of Object.keys(map)) if (map[k] === id) delete map[k];
      persistSet('bookmarkCollections', list);
      persistSet('bookmarkCollectionByEchoId', map);
      set({ bookmarkCollections: list, bookmarkCollectionByEchoId: map });
    },
    setBookmarkCollection: (echoId, collectionId) => {
      const map = { ...get().bookmarkCollectionByEchoId };
      if (collectionId) map[echoId] = collectionId; else delete map[echoId];
      persistSet('bookmarkCollectionByEchoId', map);
      set({ bookmarkCollectionByEchoId: map });
    },

    // ── Pinned echoes ──
    pinnedEchoIds: persistGet<string[]>('pinnedEchoIds', []),
    togglePinEcho: (echoId) => {
      const ids = [...get().pinnedEchoIds];
      const idx = ids.indexOf(echoId);
      if (idx >= 0) {
        ids.splice(idx, 1);
      } else if (ids.length < 3) {
        ids.unshift(echoId);
      } else {
        return; // 3-pin cap
      }
      persistSet('pinnedEchoIds', ids);
      set({ pinnedEchoIds: ids });
    },
    isPinned: (echoId) => get().pinnedEchoIds.includes(echoId),

    // ── Reset ──
    resetSocialData: () => {
      const keys = [
        'publishedEchoes', 'likedIds', 'bookmarkedIds', 'repostedIds',
        'commentsByEcho', 'followingIds', 'notifications', 'conversations',
        'messagesByConversation', 'stories', 'blockedIds', 'mutedIds',
        'mutedThreadIds', 'pinnedEchoIds', 'bookmarkCollections',
        'bookmarkCollectionByEchoId',
      ];
      keys.forEach(k => persistSet(k, Array.isArray(persistGet(k, [])) ? [] : {}));
      // Reset onboarding-coach flags so a fresh signup on the same device
      // sees the first-Echo coach again. The settings slice owns these,
      // but they're guarded against re-publishing accidental dismissals.
      persistSet('dismissedFirstEchoCoach', false);
      persistSet('hasCompletedProductOnboarding', false);
      persistSet('onboardingDraftCreated', false);
      persistSet('targetCategory', 'focus');
      persistSet('targetOutcome', '');
      persistSet('targetMiniApps', ['pomodoro', 'habits', 'notes', 'voice-memo']);
      set({
        publishedEchoes: [], likedIds: [], bookmarkedIds: [], repostedIds: [],
        commentsByEcho: {}, followingIds: [], notifications: [],
        conversations: [], messagesByConversation: {}, stories: [],
        blockedIds: [], mutedIds: [], mutedThreadIds: [], pinnedEchoIds: [],
        bookmarkCollections: [], bookmarkCollectionByEchoId: {},
        dismissedFirstEchoCoach: false,
        hasCompletedProductOnboarding: false,
        onboardingDraftCreated: false,
        targetCategory: 'focus',
        targetOutcome: '',
        targetMiniApps: ['pomodoro', 'habits', 'notes', 'voice-memo'],
      });
    },
  };
}
