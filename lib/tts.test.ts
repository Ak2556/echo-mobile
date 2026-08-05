import { describe, it, expect, vi } from 'vitest';

// tts.ts registers an AppState listener and reads the app store at module load;
// stub the native/store deps so the pure helpers can be imported in node.
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() } }));
vi.mock('../store/useAppStore', () => ({
  useAppStore: { getState: () => ({ appLanguage: 'en', speechRate: 1 }) },
}));

import { cleanForSpeech, chunkText, detectSpeechLang, localeFor } from './tts';

describe('cleanForSpeech', () => {
  it('strips markdown emphasis and headings', () => {
    expect(cleanForSpeech('## Title\n**bold** and _italic_')).toBe('Title bold and italic');
  });
  it('turns links into their text and drops bare URLs', () => {
    expect(cleanForSpeech('see [the docs](https://x.com/y)')).toBe('see the docs');
    expect(cleanForSpeech('go https://example.com/page now')).toBe('go now');
  });
  it('drops code fences and inline code markers', () => {
    expect(cleanForSpeech('run `npm test` please')).toBe('run npm test please');
    expect(cleanForSpeech('a ```js\ncode\n``` b')).toBe('a . b');
  });
  it('keeps the words of @mentions and #tags', () => {
    expect(cleanForSpeech('hi @alice about #climate')).toBe('hi alice about climate');
  });
  it('removes emoji so they are not read as names', () => {
    expect(cleanForSpeech('nice work 🔥🔥 done ✅')).toBe('nice work done');
  });
  it('collapses runaway punctuation and whitespace', () => {
    expect(cleanForSpeech('wow!!!!   really???')).toBe('wow! really?');
  });
  it('is safe on empty / nullish input', () => {
    expect(cleanForSpeech('')).toBe('');
    // @ts-expect-error — exercising the nullish guard
    expect(cleanForSpeech(undefined)).toBe('');
  });
});

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('Hello there.')).toEqual(['Hello there.']);
  });
  it('splits on sentence boundaries and respects the max length', () => {
    const s = 'One two three four. Five six seven eight. Nine ten.';
    const chunks = chunkText(s, 24);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(24);
    expect(chunks.join(' ')).toContain('Nine ten.');
  });
  it('handles text with no sentence punctuation', () => {
    expect(chunkText('just some words')).toEqual(['just some words']);
  });
});

describe('detectSpeechLang', () => {
  it('detects scripts', () => {
    expect(detectSpeechLang('नमस्ते दुनिया', 'en')).toBe('hi');
    expect(detectSpeechLang('مرحبا بالعالم', 'en')).toBe('ar');
    expect(detectSpeechLang('こんにちは', 'en')).toBe('ja');
    expect(detectSpeechLang('안녕하세요', 'en')).toBe('ko');
  });
  it('falls back to the reader language for Latin text (if Latin-based)', () => {
    expect(detectSpeechLang('hello world', 'es')).toBe('es');
    expect(detectSpeechLang('hello world', 'hi')).toBe('en'); // non-Latin fallback → English
  });
});

describe('localeFor', () => {
  it('maps app languages to BCP-47 voice locales', () => {
    expect(localeFor('hi')).toBe('hi-IN');
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('ar')).toBe('ar-SA');
  });
});
