import { describe, expect, it } from 'vitest';
import { personName } from './personName';

/**
 * Seen in Explore, "People to start with": an avatar, a blank line where the
 * name belongs, and @user_a7a3c41df79c underneath. UserRow rendered
 * {user.displayName} directly while the avatar beside it already used
 * `displayName || username`, so the two halves of the same row disagreed about
 * whether the person had a name.
 */
describe('personName', () => {
  it('prefers the display name', () => {
    expect(personName({ displayName: 'Akash', username: 'akashhere12' })).toBe('Akash');
  });

  it('falls back to the handle rather than rendering nothing', () => {
    expect(personName({ displayName: '', username: 'user_a7a3c41df79c' })).toBe('user_a7a3c41df79c');
    expect(personName({ displayName: null, username: 'monu123' })).toBe('monu123');
    expect(personName({ username: 'monu123' })).toBe('monu123');
  });

  it('treats whitespace as no name', () => {
    // A display name of ' ' renders as a blank row, same as an empty one.
    expect(personName({ displayName: '   ', username: 'monu123' })).toBe('monu123');
    expect(personName({ displayName: '\n', username: 'monu123' })).toBe('monu123');
  });

  it('trims a padded name instead of rendering the padding', () => {
    expect(personName({ displayName: '  Akash  ', username: 'akashhere12' })).toBe('Akash');
  });

  it('never returns an empty string', () => {
    for (const person of [
      { displayName: '', username: '' },
      { displayName: null, username: null },
      {},
      null,
      undefined,
    ]) {
      expect(personName(person as never)).not.toBe('');
    }
  });
});
