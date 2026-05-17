import { create } from 'zustand';
import { AuthSlice, createAuthSlice } from './slices/authSlice';
import { ChatSlice, createChatSlice } from './slices/chatSlice';
import { SocialSlice, createSocialSlice } from './slices/socialSlice';
import { SettingsSlice, createSettingsSlice } from './slices/settingsSlice';
import { RetentionSlice, createRetentionSlice } from './slices/retentionSlice';

type AppState = AuthSlice & ChatSlice & SocialSlice & SettingsSlice & RetentionSlice;

export const useAppStore = create<AppState>()((set, get) => ({
  ...createAuthSlice(set, get),
  ...createChatSlice(set, get as () => ChatSlice),
  ...createSocialSlice(set, get as () => SocialSlice & { username: string; displayName: string; avatarColor: string }),
  ...createSettingsSlice(set, get),
  ...createRetentionSlice(set, get as () => RetentionSlice),
}));
