import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hooks = readFileSync('hooks/queries/useDMs.ts', 'utf8');
const messages = readFileSync('lib/e2ee/messages.ts', 'utf8');
const thread = readFileSync('app/messages/[id].tsx', 'utf8');

describe('a message to an existing chat is one request', () => {
  it('every send path addresses an existing conversation by its id, with no get-or-create first', () => {
    // text, image, voice, link, contact, echo
    expect(hooks.match(/if \(isGroup \|\| isConversationId\(conversationId\)\) \{/g)?.length).toBe(6);
    expect(hooks).not.toMatch(/if \(isGroup\) \{\s*if \(!conversationId\)/);
  });

  it('who to seal to comes from the remembered lookups, not three fresh requests', () => {
    expect(messages).toMatch(/createSendTargets\(\{/);
    expect(messages).toMatch(/await sendTargets\.resolve\(msg\.conversationId, msg\.senderId\)/);
    expect(messages).not.toMatch(/fetchTargetDevices\(\[recipientId, msg\.senderId\]\)/);
  });

  it('still fails closed, and a failed send makes the next one look the recipient up again', () => {
    expect(messages).toMatch(/if \(!resolved\.ready\) throw new E2EEError\('recipient_not_ready'\)/);
    expect(messages).toMatch(/sendTargets\.invalidate\(msg\.conversationId, msg\.senderId\)/);
  });

  it('the thread warms the lookups when it opens, for 1:1 chats only', () => {
    expect(thread).toMatch(/if \(!remote \|\| !id \|\| !userId \|\| isGroupConversation\) return;\s*prefetchSendTargets\(id, userId\)/);
  });
});
