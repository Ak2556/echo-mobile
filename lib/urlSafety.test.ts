import { describe, expect, it } from 'vitest';
import {
  isAllowedAuthCallbackUrl,
  isSafeExternalUrl,
  parseEchoUniversalLink,
  safeRouteId,
} from './urlSafety';

describe('url safety', () => {
  it('allows only expected auth callback URLs', () => {
    expect(isAllowedAuthCallbackUrl('echo://auth/callback?code=abc')).toBe(true);
    expect(isAllowedAuthCallbackUrl('echo:///auth/callback#access_token=a&refresh_token=b')).toBe(true);
    expect(isAllowedAuthCallbackUrl('https://echo.app/auth/callback?code=abc')).toBe(true);

    expect(isAllowedAuthCallbackUrl('echo://settings?code=abc')).toBe(false);
    expect(isAllowedAuthCallbackUrl('https://evil.test/auth/callback?code=abc')).toBe(false);
    expect(isAllowedAuthCallbackUrl('https://echo.app.evil.test/auth/callback?code=abc')).toBe(false);
  });

  it('parses only clean universal-link routes', () => {
    expect(parseEchoUniversalLink('https://echo.app/e/post_1')).toEqual({ kind: 'echo', id: 'post_1' });
    expect(parseEchoUniversalLink('https://www.echo.app/u/user-1')).toEqual({ kind: 'user', id: 'user-1' });
    expect(parseEchoUniversalLink('https://echo.app/c/comment.1')).toEqual({ kind: 'comment', id: 'comment.1' });

    expect(parseEchoUniversalLink('https://echo.app/e/post_1/extra')).toBeNull();
    expect(parseEchoUniversalLink('https://echo.app/e/post%2F1')).toBeNull();
    expect(parseEchoUniversalLink('https://echo.app.evil.test/e/post_1')).toBeNull();
    expect(parseEchoUniversalLink('http://echo.app/e/post_1')).toBeNull();
  });

  it('accepts only compact route IDs', () => {
    expect(safeRouteId('abc-123_DEF.4')).toBe('abc-123_DEF.4');
    expect(safeRouteId(' abc ')).toBe('abc');
    expect(safeRouteId('../abc')).toBeNull();
    expect(safeRouteId('abc/def')).toBeNull();
    expect(safeRouteId('a'.repeat(129))).toBeNull();
  });

  it('allows only safe external URL shapes', () => {
    expect(isSafeExternalUrl('https://echo.app/privacy')).toBe(true);
    expect(isSafeExternalUrl('mailto:support@echo.app')).toBe(true);

    expect(isSafeExternalUrl('http://echo.app/privacy')).toBe(false);
    expect(isSafeExternalUrl('https://user:pass@echo.app/privacy')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('mailto:support@echo.app%0AInjected: yes')).toBe(false);
  });
});
