export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  bio: string;
  isVerified: boolean;
  followerCount: number;
  followingCount: number;
  echoCount: number;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface FeedItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  isVerified: boolean;
  prompt: string;
  response: string;
  likes: number;
  isLiked: boolean;
  isBookmarked: boolean;
  isReposted: boolean;
  repostCount: number;
  commentCount: number;
  viewCount: number;
  hashtags: string[];
  createdAt: string;
  // If this is a repost
  repostedBy?: string;
  repostedByUsername?: string;
}

export interface Comment {
  id: string;
  echoId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  isVerified: boolean;
  content: string;
  likes: number;
  isLiked: boolean;
  parentId?: string; // for replies
  replyCount: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'repost' | 'mention' | 'dm';
  fromUserId: string;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatarColor: string;
  targetId?: string; // echo or comment id
  targetPreview?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  isVerified: boolean;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  prompt: string;
  response: string;
  viewCount: number;
  isViewed: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface Report {
  id: string;
  targetType: 'user' | 'echo' | 'comment';
  targetId: string;
  reason: string;
  details?: string;
  createdAt: string;
}
