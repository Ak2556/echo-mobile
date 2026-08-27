import { describe, expect, it } from 'vitest';
import { toSpeechLocale, FALLBACK_LOCALE } from './voiceLocale';

describe('toSpeechLocale', () => {
  it('adds a region to the bare codes the app actually stores', () => {
    // This is the bug: appLanguage holds "en", the recogniser wants "en-IN",
    // and a bare code comes back as language-not-supported.
    expect(toSpeechLocale('en')).toBe('en-IN');
    expect(toSpeechLocale('hi')).toBe('hi-IN');
    expect(toSpeechLocale('bn')).toBe('bn-IN');
    expect(toSpeechLocale('ta')).toBe('ta-IN');
    expect(toSpeechLocale('te')).toBe('te-IN');
  });

  it('regions English to India rather than the US', () => {
    // The audience is Indian; en-IN handles the accent and is the offline model
    // most likely to already be installed.
    expect(toSpeechLocale('en')).toBe('en-IN');
  });

  it('keeps a region the caller already supplied', () => {
    expect(toSpeechLocale('pt-BR')).toBe('pt-BR');
    expect(toSpeechLocale('en-US')).toBe('en-US');
    expect(toSpeechLocale('en-GB')).toBe('en-GB');
  });

  it('normalises casing and underscore separators', () => {
    expect(toSpeechLocale('en_in')).toBe('en-IN');
    expect(toSpeechLocale('PT-br')).toBe('pt-BR');
  });

  it('falls back rather than passing something unusable through', () => {
    expect(toSpeechLocale('')).toBe(FALLBACK_LOCALE);
    expect(toSpeechLocale(null)).toBe(FALLBACK_LOCALE);
    expect(toSpeechLocale(undefined)).toBe(FALLBACK_LOCALE);
    expect(toSpeechLocale('   ')).toBe(FALLBACK_LOCALE);
    expect(toSpeechLocale('klingon')).toBe(FALLBACK_LOCALE);
  });

  it('always returns something with a region', () => {
    // A bare code is the failure mode; no input should ever produce one.
    for (const input of ['en', 'hi', 'ar', 'zz', '', 'xx-YY', 'fr']) {
      expect(toSpeechLocale(input)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});
