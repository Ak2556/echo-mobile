import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';

describe('Settings State & Mutators', () => {
  beforeEach(() => {
    
    
  });

  const getS = () => useAppStore.getState();

  it('updates Essentials settings', () => {
    getS().setNotificationsEnabled(false);
    expect(getS().notificationsEnabled).toBe(false);

    getS().setHapticEnabled(false);
    expect(getS().hapticEnabled).toBe(false);

    getS().setSoundEnabled(false);
    expect(getS().soundEnabled).toBe(false);

    getS().setSpeechRate(1.5);
    expect(getS().speechRate).toBe(1.5);

    getS().setAutoReadAiReplies(true);
    expect(getS().autoReadAiReplies).toBe(true);

    getS().setAutoReadMessages(true);
    expect(getS().autoReadMessages).toBe(true);

    getS().setVoiceCaptions(false);
    expect(getS().voiceCaptions).toBe(false);

    getS().setPrivateAccount(true);
    expect(getS().privateAccount).toBe(true);

    getS().setSensitiveContentFilter(false);
    expect(getS().sensitiveContentFilter).toBe(false);
  });

  it('updates Privacy & Safety settings', () => {
    getS().setActivityStatus(false);
    expect(getS().activityStatus).toBe(false);

    getS().setOnlineStatus(false);
    expect(getS().onlineStatus).toBe(false);

    getS().setProfilePhotoVisible(false);
    expect(getS().profilePhotoVisible).toBe(false);

    getS().setReadReceipts(false);
    expect(getS().readReceipts).toBe(false);

    getS().setPersonalizedNotifications(true);
    expect(getS().personalizedNotifications).toBe(true);

    getS().setDmPrivacy('nobody');
    expect(getS().dmPrivacy).toBe('nobody');
  });

  it('updates Accessibility & Display settings', () => {
    getS().setTheme('tokyonight');
    expect(getS().theme).toBe('tokyonight');

    getS().setDarkMode(false);
    expect(getS().darkMode).toBe(false);

    getS().setPureBlackBackground(false);
    expect(getS().pureBlackBackground).toBe(false);

    getS().setAccentColor('#FFFFFF');
    expect(getS().accentColor).toBe('#FFFFFF');

    getS().setFontSize('large');
    expect(getS().fontSize).toBe('large');

    getS().setFontStyle('modern');
    expect(getS().fontStyle).toBe('modern');

    getS().setRoundedCorners('small');
    expect(getS().roundedCorners).toBe('small');

    getS().setShowAvatars(false);
    expect(getS().showAvatars).toBe(false);

    getS().setShowPreviewCards(false);
    expect(getS().showPreviewCards).toBe(false);

    getS().setReduceAnimations(true);
    expect(getS().reduceAnimations).toBe(true);
  });

  it('updates Content & Feed settings', () => {
    getS().setAppLanguage('es');
    expect(getS().appLanguage).toBe('es');

    getS().setContentLanguage('French');
    expect(getS().contentLanguage).toBe('French');

    getS().setFeedSort('popular');
    expect(getS().feedSort).toBe('popular');

    getS().setCompactFeed(true);
    expect(getS().compactFeed).toBe(true);

    getS().setAutoplayStories(false);
    expect(getS().autoplayStories).toBe(false);

    getS().setDataSaver(true);
    expect(getS().dataSaver).toBe(true);
  });

  it('updates Chat & AI settings', () => {
    getS().setAiModel('gemini-2.5-pro');
    expect(getS().aiModel).toBe('gemini-2.5-pro');

    getS().setPersonaLearningEnabled(false);
    expect(getS().personaLearningEnabled).toBe(false);

    getS().setChatBubbleStyle('minimal');
    expect(getS().chatBubbleStyle).toBe('minimal');

    getS().setStreamResponses(false);
    expect(getS().streamResponses).toBe(false);

    getS().setShowTypingIndicator(false);
    expect(getS().showTypingIndicator).toBe(false);

    getS().setAutoSaveChats(false);
    expect(getS().autoSaveChats).toBe(false);
  });
});
