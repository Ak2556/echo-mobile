import { User, Notification, Conversation, DirectMessage, Story } from '../types';

export const MOCK_USERS: User[] = [
  { id: 'u1', username: 'aena_dev', displayName: 'Aena', avatarColor: '#3B82F6', bio: 'Building the future with code', isVerified: true, followerCount: 1243, followingCount: 89, echoCount: 47, createdAt: '2025-01-15T00:00:00Z' },
  { id: 'u2', username: 'sys_admin', displayName: 'SysOps', avatarColor: '#10B981', bio: 'DevOps engineer | Cloud native', isVerified: false, followerCount: 856, followingCount: 124, echoCount: 31, createdAt: '2025-02-01T00:00:00Z' },
  { id: 'u3', username: 'echo_fan', displayName: 'Echo Enthusiast', avatarColor: '#8B5CF6', bio: 'AI explorer and tech lover', isVerified: false, followerCount: 432, followingCount: 201, echoCount: 18, createdAt: '2025-03-10T00:00:00Z' },
  { id: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', bio: 'Machine learning researcher @ Stanford', isVerified: true, followerCount: 5621, followingCount: 312, echoCount: 92, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', bio: 'Product designer | Dark mode advocate', isVerified: true, followerCount: 3102, followingCount: 178, echoCount: 56, createdAt: '2025-02-20T00:00:00Z' },
  { id: 'u6', username: 'backend_pro', displayName: 'Backend Bob', avatarColor: '#06B6D4', bio: 'System architect | Distributed systems', isVerified: false, followerCount: 1890, followingCount: 95, echoCount: 63, createdAt: '2025-01-25T00:00:00Z' },
  { id: 'u7', username: 'crypto_kate', displayName: 'Kate Web3', avatarColor: '#EC4899', bio: 'Web3 builder | Solidity dev', isVerified: false, followerCount: 2340, followingCount: 167, echoCount: 38, createdAt: '2025-03-01T00:00:00Z' },
  { id: 'u8', username: 'data_dave', displayName: 'Data Dave', avatarColor: '#14B8A6', bio: 'Data scientist | Python enthusiast', isVerified: false, followerCount: 967, followingCount: 234, echoCount: 29, createdAt: '2025-04-01T00:00:00Z' },
];

export const SEED_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'like', fromUserId: 'u4', fromUsername: 'ml_engineer', fromDisplayName: 'ML Maya', fromAvatarColor: '#F59E0B', targetId: '1', targetPreview: 'Write a haiku about React Native...', isRead: false, createdAt: new Date(Date.now() - 300000).toISOString() },
  { id: 'n2', type: 'follow', fromUserId: 'u5', fromUsername: 'design_lead', fromDisplayName: 'Design Dan', fromAvatarColor: '#EF4444', isRead: false, createdAt: new Date(Date.now() - 600000).toISOString() },
  { id: 'n3', type: 'comment', fromUserId: 'u2', fromUsername: 'sys_admin', fromDisplayName: 'SysOps', fromAvatarColor: '#10B981', targetId: '2', targetPreview: 'Great insight on pgvector!', isRead: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: 'n4', type: 'repost', fromUserId: 'u7', fromUsername: 'crypto_kate', fromDisplayName: 'Kate Web3', fromAvatarColor: '#EC4899', targetId: '3', targetPreview: 'What is the fastest mobile framework?', isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'n5', type: 'like', fromUserId: 'u6', fromUsername: 'backend_pro', fromDisplayName: 'Backend Bob', fromAvatarColor: '#06B6D4', targetId: '1', targetPreview: 'Write a haiku about React Native...', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: 'n6', type: 'mention', fromUserId: 'u3', fromUsername: 'echo_fan', fromDisplayName: 'Echo Enthusiast', fromAvatarColor: '#8B5CF6', targetId: '5', targetPreview: 'mentioned you in a comment', isRead: true, createdAt: new Date(Date.now() - 14400000).toISOString() },
  { id: 'n7', type: 'follow', fromUserId: 'u8', fromUsername: 'data_dave', fromDisplayName: 'Data Dave', fromAvatarColor: '#14B8A6', isRead: true, createdAt: new Date(Date.now() - 28800000).toISOString() },
];

export const SEED_CONVERSATIONS: Conversation[] = [
  { id: 'conv1', userId: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', isVerified: true, lastMessage: 'That transformer explanation was really helpful!', lastMessageAt: new Date(Date.now() - 1800000).toISOString(), unreadCount: 2 },
  { id: 'conv2', userId: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', isVerified: true, lastMessage: 'Love the dark mode tips', lastMessageAt: new Date(Date.now() - 7200000).toISOString(), unreadCount: 0 },
  { id: 'conv3', userId: 'u2', username: 'sys_admin', displayName: 'SysOps', avatarColor: '#10B981', isVerified: false, lastMessage: 'Can you help with pgvector indexing?', lastMessageAt: new Date(Date.now() - 86400000).toISOString(), unreadCount: 1 },
];

export const SEED_DMS: Record<string, DirectMessage[]> = {
  conv1: [
    { id: 'dm1', senderId: 'u4', content: 'Hey! Loved your echo about React Native performance', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 'dm2', senderId: 'me', content: 'Thanks Maya! Reanimated v4 is incredible', isRead: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'dm3', senderId: 'u4', content: 'That transformer explanation was really helpful!', isRead: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'dm4', senderId: 'u4', content: 'Would love to collaborate on an AI post sometime', isRead: false, createdAt: new Date(Date.now() - 1700000).toISOString() },
  ],
  conv2: [
    { id: 'dm5', senderId: 'me', content: 'Hey Dan, what do you think of OLED-optimized designs?', isRead: true, createdAt: new Date(Date.now() - 14400000).toISOString() },
    { id: 'dm6', senderId: 'u5', content: 'Love the dark mode tips', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
  ],
  conv3: [
    { id: 'dm7', senderId: 'u2', content: 'Can you help with pgvector indexing?', isRead: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  ],
};

export const SEED_STORIES: Story[] = [
  { id: 's1', userId: 'u4', username: 'ml_engineer', displayName: 'ML Maya', avatarColor: '#F59E0B', prompt: 'Explain gradient descent in one sentence', response: 'Gradient descent iteratively adjusts parameters by moving in the direction that most reduces the error.', viewCount: 89, isViewed: false, createdAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 82800000).toISOString() },
  { id: 's2', userId: 'u5', username: 'design_lead', displayName: 'Design Dan', avatarColor: '#EF4444', prompt: 'Best color palette for fintech apps?', response: 'Deep navy (#1a1f36) with bright teal (#00d4aa) accents. Use warm grays for text and subtle green for positive values.', viewCount: 156, isViewed: false, createdAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 79200000).toISOString() },
  { id: 's3', userId: 'u7', username: 'crypto_kate', displayName: 'Kate Web3', avatarColor: '#EC4899', prompt: 'Explain zero knowledge proofs simply', response: "Imagine proving you know a password without ever revealing it — that's ZKP. You convince the verifier of truth without sharing the underlying data.", viewCount: 234, isViewed: false, createdAt: new Date(Date.now() - 1800000).toISOString(), expiresAt: new Date(Date.now() + 84600000).toISOString() },
  { id: 's4', userId: 'u1', username: 'aena_dev', displayName: 'Aena', avatarColor: '#3B82F6', prompt: 'Best Expo Router tips?', response: 'Use typed routes for safety, parallel routes for layouts, and group routes with (parentheses) for shared UI without URL segments.', viewCount: 312, isViewed: true, createdAt: new Date(Date.now() - 10800000).toISOString(), expiresAt: new Date(Date.now() + 75600000).toISOString() },
];
