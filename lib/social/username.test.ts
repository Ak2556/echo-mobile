import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanUsername, isAutoUsername, isValidUsername } from './username';

describe('username rules', () => {
  it('cleans input down to what a mention can match', () => {
    expect(cleanUsername('Devansh Jaswal')).toBe('devanshjaswal');
    expect(cleanUsername("it's.mayank")).toBe('itsmayank');
    expect(cleanUsername('a'.repeat(30))).toHaveLength(20);
  });

  it('accepts 3–20 of [a-z0-9_] only', () => {
    expect(isValidUsername('ak_2556')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('has space')).toBe(false);
    expect(isValidUsername('dotted.name')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  // Both shapes found in production on 2026-09-30.
  it('recognises generated handles', () => {
    expect(isAutoUsername('user_someone22_17583')).toBe(true);
    expect(isAutoUsername('user_someone_62246')).toBe(true);
    expect(isAutoUsername('user_0a7bcde3')).toBe(true);
    expect(isAutoUsername('user_0a7bcde3f4a1')).toBe(true);
  });

  it('leaves chosen handles alone, including ones that start with user_', () => {
    expect(isAutoUsername('akashhere12')).toBe(false);
    expect(isAutoUsername('user_friendly')).toBe(false);
    expect(isAutoUsername('user_2024')).toBe(false);
    expect(isAutoUsername(null)).toBe(false);
  });
});

describe('every username entry point uses the shared rules', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('the wizard and Edit Profile clean input the same way', () => {
    expect(src('app/auth/signup-wizard.tsx')).toMatch(/cleanUsername\(usernameRaw\)/);
    expect(src('app/edit-profile.tsx')).toMatch(/setNewUsername\(cleanUsername\(v\)\)/);
  });

  it('Edit Profile checks availability before saving a changed handle', () => {
    expect(src('app/edit-profile.tsx')).toMatch(/usernameChanged && await isUsernameTaken\(newUsername\)/);
  });

  it('Home asks accounts with a generated handle to choose one', () => {
    expect(src('app/(tabs)/home.tsx')).toMatch(/isAutoUsername\(username\) && <ChooseHandleCard/);
  });
});

describe('tapping a person opens their profile', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('Avatar only zooms where a screen opts in', () => {
    expect(src('components/ui/Avatar.tsx')).toMatch(/zoomable = false,/);
  });

  it('feed cards never open the author photo full screen', () => {
    const feedCard = src('components/feed/FeedCard.tsx');
    expect(feedCard).not.toMatch(/setAvatarViewerOpen|avatarUrl[^\n]*ZoomableImageViewer|ZoomableImageViewer[^>]*avatarUrl/);
    // The one viewer in the card is the post's own photos (photo-post tap).
    expect(feedCard.match(/<ZoomableImageViewer/g)).toHaveLength(1);
    expect(feedCard).toMatch(/<ZoomableImageViewer[^>]*uris=\{item\.mediaUris!\}/);
  });

  it('a commenter photo and name open their profile', () => {
    const card = src('components/feed/CommentCard.tsx');
    expect(card.match(/onPress=\{openAuthor\}/g)).toHaveLength(2);
  });
});
