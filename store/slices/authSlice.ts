import { persistGet, persistSet } from '../persist';

export interface AuthSlice {
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
  avatarUrl: string;
  setUsername: (n: string) => void;
  setDisplayName: (n: string) => void;
  setBio: (b: string) => void;
  setAvatarColor: (c: string) => void;
  setAvatarUrl: (url: string) => void;
}

export function createAuthSlice(set: (partial: object) => void, _get: () => unknown): AuthSlice {
  return {
    hasSeenOnboarding: persistGet('hasSeenOnboarding', false),
    setHasSeenOnboarding: (v) => { persistSet('hasSeenOnboarding', v); set({ hasSeenOnboarding: v }); },
    userId: persistGet('userId', 'me'),
    setUserId: (id) => { persistSet('userId', id); set({ userId: id }); },
    username: persistGet('username', ''),
    displayName: persistGet('displayName', ''),
    bio: persistGet('bio', ''),
    avatarColor: persistGet('avatarColor', '#3B82F6'),
    avatarUrl: persistGet('avatarUrl', ''),
    setUsername: (n) => { persistSet('username', n); set({ username: n }); },
    setDisplayName: (n) => { persistSet('displayName', n); set({ displayName: n }); },
    setBio: (b) => { persistSet('bio', b); set({ bio: b }); },
    setAvatarColor: (c) => { persistSet('avatarColor', c); set({ avatarColor: c }); },
    setAvatarUrl: (url) => { persistSet('avatarUrl', url); set({ avatarUrl: url }); },
  };
}
