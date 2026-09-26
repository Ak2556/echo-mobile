import { describe, expect, it } from 'vitest';
import { dmPushBody } from './copy';

describe('dmPushBody', () => {
  it('shows the preview when the server has one', () => {
    expect(dmPushBody('see you at 6')).toBe('see you at 6');
  });
  it('caps it at 140 characters', () => {
    expect(dmPushBody('x'.repeat(300))).toHaveLength(140);
  });
  it('never sends a blank notification for a sealed message', () => {
    expect(dmPushBody(null)).toBe('Sent you a message');
    expect(dmPushBody(undefined)).toBe('Sent you a message');
    expect(dmPushBody('   ')).toBe('Sent you a message');
  });
});
