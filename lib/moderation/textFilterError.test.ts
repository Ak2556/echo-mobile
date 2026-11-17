import { describe, expect, it } from 'vitest';
import {
  TEXT_FILTER_CODE, isTextFilterError, textFilterMessage, textFilterSurface, writeErrorMessage,
} from './textFilterError';
import { isTransientError } from '../core/mutationErrors';
import { HI_BULK } from '../i18n/i18nPhrasesHi';
import { translate } from '../i18n/i18n';

const filterError = (surface: string) => ({ code: 'EC001', message: `text_filter:${surface}`, details: null, hint: null });

describe('textFilterSurface', () => {
  it('reads the surface from the database error', () => {
    expect(textFilterSurface(filterError('comment'))).toBe('comment');
    expect(textFilterSurface(filterError('display_name'))).toBe('display_name');
    expect(textFilterSurface(filterError('answer'))).toBe('answer');
  });

  it('is null for any other error, so nothing else is rewritten', () => {
    expect(textFilterSurface({ code: '23505', message: 'duplicate key' })).toBeNull();
    expect(textFilterSurface(new Error('network'))).toBeNull();
    expect(textFilterSurface(null)).toBeNull();
    expect(textFilterSurface(undefined)).toBeNull();
    expect(textFilterSurface('text_filter:comment')).toBeNull();
  });

  it('does not trust the message alone: the code must match', () => {
    expect(textFilterSurface({ code: 'P0001', message: 'text_filter:comment' })).toBeNull();
  });

  it('gives a filter error with an unrecognised surface the generic wording, not a raw code', () => {
    expect(textFilterSurface({ code: TEXT_FILTER_CODE, message: 'text_filter:something_new' })).toBe('unknown');
    expect(textFilterSurface({ code: TEXT_FILTER_CODE })).toBe('unknown');
  });
});

describe('writeErrorMessage', () => {
  it('turns a filter refusal into words a person can act on, without naming the term', () => {
    const msg = writeErrorMessage(filterError('comment'));
    expect(msg).toMatch(/Please change it/);
    expect(msg).not.toMatch(/text_filter|EC001/);
  });

  it('falls back to the error message for everything else', () => {
    expect(writeErrorMessage(new Error('Network request failed'))).toBe('Network request failed');
    expect(writeErrorMessage(null)).toBe('');
  });

  it('has different wording where it helps: a username asks for another, a comment for an edit', () => {
    expect(textFilterMessage('username')).toMatch(/choose another/);
    expect(textFilterMessage('comment')).toMatch(/try again/);
  });
});

describe('the outbox', () => {
  it('treats a filter refusal as permanent, so a rejected offline comment is never retried', () => {
    expect(isTransientError(filterError('comment'))).toBe(false);
    expect(isTextFilterError(filterError('comment'))).toBe(true);
  });
});

describe('Hindi', () => {
  const surfaces = ['comment', 'answer', 'username', 'display_name', 'bio', 'unknown'] as const;
  for (const surface of surfaces) {
    it(`has Hindi for the ${surface} message`, () => {
      const english = textFilterMessage(surface);
      expect(HI_BULK[english], english).toBeTruthy();
    });
  }
  it('is wired to the real translator (smoke)', () => {
    expect(typeof translate).toBe('function');
  });
});
