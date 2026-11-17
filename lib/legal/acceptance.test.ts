import { describe, expect, it } from 'vitest';
import { acceptedToken, hasAcceptedCurrent } from './acceptance';

const NOW = { terms: '3.2', privacy: '3.3' };

describe('hasAcceptedCurrent', () => {
  it('is false with no record', () => {
    expect(hasAcceptedCurrent([], NOW)).toBe(false);
  });

  it('is true when both current versions are on record', () => {
    expect(hasAcceptedCurrent([{ kind: 'terms', version: '3.2' }, { kind: 'privacy', version: '3.3' }], NOW)).toBe(true);
  });

  it('needs both documents, not just one', () => {
    expect(hasAcceptedCurrent([{ kind: 'terms', version: '3.2' }], NOW)).toBe(false);
    expect(hasAcceptedCurrent([{ kind: 'privacy', version: '3.3' }], NOW)).toBe(false);
  });

  it('asks again when either document moves to a new version', () => {
    const rows = [{ kind: 'terms', version: '3.2' }, { kind: 'privacy', version: '3.3' }];
    expect(hasAcceptedCurrent(rows, { terms: '3.3', privacy: '3.3' })).toBe(false);
    expect(hasAcceptedCurrent(rows, { terms: '3.2', privacy: '3.4' })).toBe(false);
  });

  it('does not let a version of one document stand in for the other', () => {
    // terms 3.3 on record must not satisfy privacy 3.3
    expect(hasAcceptedCurrent([{ kind: 'terms', version: '3.3' }, { kind: 'terms', version: '3.2' }], NOW)).toBe(false);
  });

  it('accepts older rows alongside current ones', () => {
    const rows = [
      { kind: 'terms', version: '3.1' }, { kind: 'privacy', version: '3.0' },
      { kind: 'terms', version: '3.2' }, { kind: 'privacy', version: '3.3' },
    ];
    expect(hasAcceptedCurrent(rows, NOW)).toBe(true);
  });
});

describe('acceptedToken', () => {
  it('differs by account, so a second account on the same phone is asked', () => {
    expect(acceptedToken('a', NOW)).not.toBe(acceptedToken('b', NOW));
  });

  it('differs by either version, so a new version is asked again', () => {
    expect(acceptedToken('a', NOW)).not.toBe(acceptedToken('a', { terms: '3.3', privacy: '3.3' }));
    expect(acceptedToken('a', NOW)).not.toBe(acceptedToken('a', { terms: '3.2', privacy: '3.4' }));
  });
});
