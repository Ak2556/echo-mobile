import { create } from 'zustand';
import { AuthSlice, createAuthSlice } from './slices/authSlice';
import { ChatSlice, createChatSlice } from './slices/chatSlice';
import { SocialSlice, createSocialSlice } from './slices/socialSlice';
import { SettingsSlice, createSettingsSlice } from './slices/settingsSlice';
import { RetentionSlice, createRetentionSlice } from './slices/retentionSlice';
import { storageHydrate, storageIsAsyncFallback } from './persist';

type AppState = AuthSlice & ChatSlice & SocialSlice & SettingsSlice & RetentionSlice;

export const useAppStore = create<AppState>()((set, get) => ({
  ...createAuthSlice(set, get),
  ...createChatSlice(set, get as () => ChatSlice),
  ...createSocialSlice(set, get as () => SocialSlice & { username: string; displayName: string; avatarColor: string; avatarUrl: string }),
  ...createSettingsSlice(set, get),
  ...createRetentionSlice(set, get as () => RetentionSlice),
}));

// When MMKV isn't available, the store initialized from an empty async-backed
// cache (defaults). Load the AsyncStorage snapshot, then re-read persisted
// settings so saved preferences survive a restart. No-op when MMKV is active.
if (storageIsAsyncFallback) {
  void storageHydrate().then(() => {
    try { useAppStore.getState().rehydrate(); } catch { /* best effort */ }
  });
}
