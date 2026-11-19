import { describe, expect, it } from 'vitest';
import { joinDictation } from './dictation';

describe('joinDictation', () => {
  it('fills an empty answer with what was said', () => {
    expect(joinDictation('', '  मेरा जवाब यह है ', 600)).toBe('मेरा जवाब यह है');
  });

  it('adds to typed text with one space between', () => {
    expect(joinDictation('I would tell myself', 'to start earlier', 600)).toBe('I would tell myself to start earlier');
  });

  it('does not double a space the user already typed', () => {
    expect(joinDictation('Start earlier. ', 'And rest more.', 600)).toBe('Start earlier. And rest more.');
  });

  it('keeps the typed text when nothing was heard', () => {
    expect(joinDictation('typed', '   ', 600)).toBe('typed');
  });

  it('never goes past the answer limit', () => {
    const out = joinDictation('a'.repeat(595), 'one two three', 600);
    expect(out).toHaveLength(600);
    expect(out.startsWith('a'.repeat(595) + ' one')).toBe(true);
  });
});
