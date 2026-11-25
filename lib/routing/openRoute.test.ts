import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Href } from 'expo-router';
import { isTabHref, openRoute } from './openRoute';

const router = vi.hoisted(() => ({ push: vi.fn(), dismissTo: vi.fn() }));
vi.mock('expo-router', () => ({ router }));

beforeEach(() => {
  router.push.mockClear();
  router.dismissTo.mockClear();
});

describe('isTabHref', () => {
  it('knows every bottom tab, with or without the group', () => {
    for (const tab of ['home', 'explore', 'chat', 'apps', 'notifications', 'watch', 'you']) {
      expect(isTabHref(`/(tabs)/${tab}` as Href)).toBe(true);
      expect(isTabHref(`/${tab}` as Href)).toBe(true);
    }
  });

  it('reads the pathname of an object href', () => {
    expect(isTabHref({ pathname: '/(tabs)/explore', params: { q: 'a' } })).toBe(true);
    expect(isTabHref({ pathname: '/thread/[id]', params: { id: '1' } })).toBe(false);
  });

  it('does not mistake other screens for tabs', () => {
    for (const href of ['/messages', '/settings', '/homework', '/chat-media/1', '/mini-apps/pomodoro', '/user/abc']) {
      expect(isTabHref(href as Href)).toBe(false);
    }
  });
});

describe('openRoute', () => {
  // 2026-11-25: pushing a tab from a screen outside the tabs stacked a whole new
  // tab navigator (feed, video, animations) on top of the old one. Three visits
  // to a switched-off screen took the app from 250 to 499 MB; enough of them ran
  // the Java heap out ("OutOfMemoryError" in a reanimated/svg draw).
  it('goes back to the tab bar already in the stack instead of pushing a copy', () => {
    openRoute('/(tabs)/home');
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/home');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the params of a tab href', () => {
    const href = { pathname: '/(tabs)/explore', params: { q: 'chai' } } as const;
    openRoute(href);
    expect(router.dismissTo).toHaveBeenCalledWith(href);
  });

  it('pushes every other screen as before', () => {
    openRoute('/messages');
    expect(router.push).toHaveBeenCalledWith('/messages');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
