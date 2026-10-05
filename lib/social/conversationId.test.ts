import { describe, expect, it } from 'vitest';
import { isConversationId } from './conversationId';

describe('isConversationId', () => {
  it('accepts a conversation row id', () => {
    expect(isConversationId('6d245112-7618-4ac2-b5fa-be884d92b8c2')).toBe(true);
  });
  it('rejects anything that is not one, so the recipient path still runs', () => {
    for (const bad of [undefined, null, '', 'me', 'new', 'pending-6d245112', 'local-123', '6d245112']) {
      expect(isConversationId(bad as string | null | undefined)).toBe(false);
    }
  });
});
