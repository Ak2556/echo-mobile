import { persistGet, persistSet, storage } from '../persist';
import type { EchoAIModel } from '../../lib/api';
import type { CurrencyCode } from '../../lib/currency';

export interface SettingsSlice {
  // ── Core ──
  hapticEnabled: boolean;
  setHapticEnabled: (v: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  privateAccount: boolean;
  setPrivateAccount: (v: boolean) => void;
  profilePhotoVisible: boolean;
  setProfilePhotoVisible: (v: boolean) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  // ── Notification prefs ──
  notifyLikes: boolean; setNotifyLikes: (v: boolean) => void;
  notifyComments: boolean; setNotifyComments: (v: boolean) => void;
  notifyFollows: boolean; setNotifyFollows: (v: boolean) => void;
  notifyDMs: boolean; setNotifyDMs: (v: boolean) => void;
  notifyReposts: boolean; setNotifyReposts: (v: boolean) => void;
  notifyMentions: boolean; setNotifyMentions: (v: boolean) => void;
  soundEnabled: boolean; setSoundEnabled: (v: boolean) => void;
  // ── Privacy ──
  readReceipts: boolean; setReadReceipts: (v: boolean) => void;
  onlineStatus: boolean; setOnlineStatus: (v: boolean) => void;
  dmPrivacy: 'everyone' | 'followers' | 'nobody';
  setDmPrivacy: (v: 'everyone' | 'followers' | 'nobody') => void;
  activityStatus: boolean; setActivityStatus: (v: boolean) => void;
  // ── Appearance ──
  theme: 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic';
  setTheme: (v: 'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic') => void;
  fontSize: 'small' | 'medium' | 'large'; setFontSize: (v: 'small' | 'medium' | 'large') => void;
  compactFeed: boolean; setCompactFeed: (v: boolean) => void;
  dismissedFirstEchoCoach: boolean; setDismissedFirstEchoCoach: (v: boolean) => void;
  reduceAnimations: boolean; setReduceAnimations: (v: boolean) => void;
  accentColor: string; setAccentColor: (v: string) => void;
  showAvatars: boolean; setShowAvatars: (v: boolean) => void;
  showPreviewCards: boolean; setShowPreviewCards: (v: boolean) => void;
  pureBlackBackground: boolean; setPureBlackBackground: (v: boolean) => void;
  roundedCorners: 'small' | 'medium' | 'large'; setRoundedCorners: (v: 'small' | 'medium' | 'large') => void;
  // ── Chat & AI ──
  aiModel: EchoAIModel; setAiModel: (v: EchoAIModel) => void;
  autoSaveChats: boolean; setAutoSaveChats: (v: boolean) => void;
  chatBubbleStyle: 'modern' | 'classic' | 'minimal'; setChatBubbleStyle: (v: 'modern' | 'classic' | 'minimal') => void;
  showTypingIndicator: boolean; setShowTypingIndicator: (v: boolean) => void;
  streamResponses: boolean; setStreamResponses: (v: boolean) => void;
  personaLearningEnabled: boolean; setPersonaLearningEnabled: (v: boolean) => void;
  // ── Content & Feed ──
  autoplayStories: boolean; setAutoplayStories: (v: boolean) => void;
  dataSaver: boolean; setDataSaver: (v: boolean) => void;
  sensitiveContentFilter: boolean; setSensitiveContentFilter: (v: boolean) => void;
  contentLanguage: string; setContentLanguage: (v: string) => void;
  feedSort: 'latest' | 'popular' | 'following'; setFeedSort: (v: 'latest' | 'popular' | 'following') => void;
  // ── Interests ──
  interests: string[];
  setInterests: (v: string[]) => void;
  // ── Thinking Archetype ──
  thinkingStyle: string;
  setThinkingStyle: (v: string) => void;
  // ── Marketplace ──
  preferredCurrency: CurrencyCode;
  setPreferredCurrency: (v: CurrencyCode) => void;
  // ── Accessibility ──
  fontScale: number;
  setFontScale: (v: number) => void;
  // ── First-run hints ──
  hasSeenChatTabHint: boolean;
  setHasSeenChatTabHint: (v: boolean) => void;
  /** Dismissal flag for the verbose "Best first chat" panel in the Chat
   *  empty state. Set true on the user's first message send. Suggestion
   *  chips remain visible — only the hint card disappears. */
  hasSeenChatEmptyHint: boolean;
  setHasSeenChatEmptyHint: (v: boolean) => void;
  hasSentFirstEcho: boolean;
  setHasSentFirstEcho: (v: boolean) => void;
  hasCompletedProductOnboarding: boolean;
  setHasCompletedProductOnboarding: (v: boolean) => void;
  onboardingDraftCreated: boolean;
  setOnboardingDraftCreated: (v: boolean) => void;
  // ── Feed feedback signals ──
  notInterestedIds: string[];
  setNotInterestedIds: (v: string[]) => void;
  feedFeedback: Record<string, 'less' | 'more'>;
  setFeedFeedback: (v: Record<string, 'less' | 'more'>) => void;
  feedScope: 'semantic' | 'forYou' | 'following' | 'latest';
  setFeedScope: (v: 'semantic' | 'forYou' | 'following' | 'latest') => void;
  // ── Recent searches ──
  recentSearches: string[];
  setRecentSearches: (v: string[]) => void;
  // ── Data management ──
  clearAllBookmarks: () => void;
  clearNotifications: () => void;
  clearAllData: () => void;
  getCacheSize: () => string;
}

function b(key: string, def: boolean) { return persistGet(key, def); }
function s(set: (p: object) => void, key: string) {
  return (v: boolean) => { persistSet(key, v); set({ [key]: v }); };
}

function getAiModel(): EchoAIModel {
  const value = persistGet<string>('aiModel', 'gemini-2.5-flash');
  if (value === 'gemini-2.5-flash' || value === 'gemini-2.5-pro' || value === 'gemini-2.0-flash-lite') {
    return value;
  }
  persistSet('aiModel', 'gemini-2.5-flash');
  return 'gemini-2.5-flash';
}

export function createSettingsSlice(set: (partial: object) => void, _get: () => unknown): SettingsSlice {
  return {
    hapticEnabled: b('hapticEnabled', true), setHapticEnabled: s(set, 'hapticEnabled'),
    notificationsEnabled: b('notificationsEnabled', true), setNotificationsEnabled: s(set, 'notificationsEnabled'),
    privateAccount: b('privateAccount', false), setPrivateAccount: s(set, 'privateAccount'),
    profilePhotoVisible: b('profilePhotoVisible', true), setProfilePhotoVisible: s(set, 'profilePhotoVisible'),
    darkMode: b('darkMode', true), setDarkMode: s(set, 'darkMode'),
    notifyLikes: b('notifyLikes', true), setNotifyLikes: s(set, 'notifyLikes'),
    notifyComments: b('notifyComments', true), setNotifyComments: s(set, 'notifyComments'),
    notifyFollows: b('notifyFollows', true), setNotifyFollows: s(set, 'notifyFollows'),
    notifyDMs: b('notifyDMs', true), setNotifyDMs: s(set, 'notifyDMs'),
    notifyReposts: b('notifyReposts', true), setNotifyReposts: s(set, 'notifyReposts'),
    notifyMentions: b('notifyMentions', true), setNotifyMentions: s(set, 'notifyMentions'),
    soundEnabled: b('soundEnabled', true), setSoundEnabled: s(set, 'soundEnabled'),
    readReceipts: b('readReceipts', true), setReadReceipts: s(set, 'readReceipts'),
    onlineStatus: b('onlineStatus', true), setOnlineStatus: s(set, 'onlineStatus'),
    dmPrivacy: persistGet<'everyone' | 'followers' | 'nobody'>('dmPrivacy', 'everyone'),
    setDmPrivacy: (v) => { persistSet('dmPrivacy', v); set({ dmPrivacy: v }); },
    activityStatus: b('activityStatus', true), setActivityStatus: s(set, 'activityStatus'),
    theme: persistGet<'midnight' | 'amoled' | 'ocean' | 'sunset' | 'forest' | 'lavender' | 'light' | 'sepia' | 'arctic'>('theme', 'midnight'),
    setTheme: (v) => { persistSet('theme', v); set({ theme: v }); },
    fontSize: persistGet<'small' | 'medium' | 'large'>('fontSize', 'medium'),
    setFontSize: (v) => { persistSet('fontSize', v); set({ fontSize: v }); },
    compactFeed: b('compactFeed', false), setCompactFeed: s(set, 'compactFeed'),
    dismissedFirstEchoCoach: b('dismissedFirstEchoCoach', false), setDismissedFirstEchoCoach: s(set, 'dismissedFirstEchoCoach'),
    reduceAnimations: b('reduceAnimations', false), setReduceAnimations: s(set, 'reduceAnimations'),
    accentColor: persistGet('accentColor', '#E06030'),
    setAccentColor: (v) => { persistSet('accentColor', v); set({ accentColor: v }); },
    showAvatars: b('showAvatars', true), setShowAvatars: s(set, 'showAvatars'),
    showPreviewCards: b('showPreviewCards', true), setShowPreviewCards: s(set, 'showPreviewCards'),
    pureBlackBackground: b('pureBlackBackground', true), setPureBlackBackground: s(set, 'pureBlackBackground'),
    roundedCorners: persistGet<'small' | 'medium' | 'large'>('roundedCorners', 'medium'),
    setRoundedCorners: (v) => { persistSet('roundedCorners', v); set({ roundedCorners: v }); },
    aiModel: getAiModel(),
    setAiModel: (v) => { persistSet('aiModel', v); set({ aiModel: v }); },
    autoSaveChats: b('autoSaveChats', true), setAutoSaveChats: s(set, 'autoSaveChats'),
    chatBubbleStyle: persistGet<'modern' | 'classic' | 'minimal'>('chatBubbleStyle', 'modern'),
    setChatBubbleStyle: (v) => { persistSet('chatBubbleStyle', v); set({ chatBubbleStyle: v }); },
    showTypingIndicator: b('showTypingIndicator', true), setShowTypingIndicator: s(set, 'showTypingIndicator'),
    streamResponses: b('streamResponses', true), setStreamResponses: s(set, 'streamResponses'),
    personaLearningEnabled: b('personaLearningEnabled', true), setPersonaLearningEnabled: s(set, 'personaLearningEnabled'),
    autoplayStories: b('autoplayStories', true), setAutoplayStories: s(set, 'autoplayStories'),
    dataSaver: b('dataSaver', false), setDataSaver: s(set, 'dataSaver'),
    sensitiveContentFilter: b('sensitiveContentFilter', true), setSensitiveContentFilter: s(set, 'sensitiveContentFilter'),
    contentLanguage: persistGet('contentLanguage', 'English'),
    setContentLanguage: (v) => { persistSet('contentLanguage', v); set({ contentLanguage: v }); },
    feedSort: persistGet<'latest' | 'popular' | 'following'>('feedSort', 'latest'),
    setFeedSort: (v) => { persistSet('feedSort', v); set({ feedSort: v }); },
    interests: persistGet<string[]>('interests', []),
    setInterests: (v) => { persistSet('interests', v); set({ interests: v }); },
    thinkingStyle: persistGet<string>('thinkingStyle', ''),
    setThinkingStyle: (v) => { persistSet('thinkingStyle', v); set({ thinkingStyle: v }); },
    preferredCurrency: persistGet<CurrencyCode>('preferredCurrency', 'INR'),
    setPreferredCurrency: (v) => { persistSet('preferredCurrency', v); set({ preferredCurrency: v }); },
    fontScale: persistGet<number>('fontScale', 1),
    setFontScale: (v) => { persistSet('fontScale', v); set({ fontScale: v }); },
    hasSeenChatTabHint: b('hasSeenChatTabHint', false), setHasSeenChatTabHint: s(set, 'hasSeenChatTabHint'),
    hasSeenChatEmptyHint: b('hasSeenChatEmptyHint', false), setHasSeenChatEmptyHint: s(set, 'hasSeenChatEmptyHint'),
    hasSentFirstEcho: b('hasSentFirstEcho', false), setHasSentFirstEcho: s(set, 'hasSentFirstEcho'),
    hasCompletedProductOnboarding: b('hasCompletedProductOnboarding', false), setHasCompletedProductOnboarding: s(set, 'hasCompletedProductOnboarding'),
    onboardingDraftCreated: b('onboardingDraftCreated', false), setOnboardingDraftCreated: s(set, 'onboardingDraftCreated'),
    notInterestedIds: persistGet<string[]>('notInterestedIds', []),
    setNotInterestedIds: (v) => { persistSet('notInterestedIds', v); set({ notInterestedIds: v }); },
    feedFeedback: persistGet<Record<string, 'less' | 'more'>>('feedFeedback', {}),
    setFeedFeedback: (v) => { persistSet('feedFeedback', v); set({ feedFeedback: v }); },
    feedScope: persistGet<'semantic' | 'forYou' | 'following' | 'latest'>('feedScope', 'forYou'),
    setFeedScope: (v) => { persistSet('feedScope', v); set({ feedScope: v }); },
    recentSearches: persistGet<string[]>('recentSearches', []),
    setRecentSearches: (v) => { persistSet('recentSearches', v.slice(0, 10)); set({ recentSearches: v.slice(0, 10) }); },
    clearAllBookmarks: () => { persistSet('bookmarkedIds', []); set({ bookmarkedIds: [] }); },
    clearNotifications: () => { persistSet('notifications', []); set({ notifications: [] }); },
    clearAllData: () => {
      storage.clearAll();
      set({
        sessions: [], messagesBySession: {}, currentSessionId: null,
        publishedEchoes: [], likedIds: [], bookmarkedIds: [], repostedIds: [],
        commentsByEcho: {}, followingIds: [], notifications: [],
        conversations: [], messagesByConversation: {},
        stories: [], blockedIds: [],
        hasSeenOnboarding: false, username: '', displayName: '', bio: '',
        avatarColor: '#3B82F6', interests: [],
        profilePhotoVisible: true,
        personaLearningEnabled: true,
        hasCompletedProductOnboarding: false, onboardingDraftCreated: false,
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
      if (total < 1048576) return `${(total / 1024).toFixed(1)} KB`;
      return `${(total / 1048576).toFixed(1)} MB`;
    },
  };
}
