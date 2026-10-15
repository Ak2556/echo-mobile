/**
 * The three-column messages layout shipped its right-hand pane with placeholder data: the
 * conversation id as the person's name and handle, a random stock photo from i.pravatar.cc
 * (a stranger's face, fetched from a third-party server on every tablet), and three buttons
 * with no handler. This keeps that from coming back.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('chat details sidebar', () => {
  const index = read('app/messages/index.tsx');
  const sidebar = read('components/chat/ChatDetailsSidebar.tsx');

  it('is fed the real conversation, not the conversation id', () => {
    expect(index).not.toMatch(/name:\s*selectedId/);
    expect(index).toMatch(/selectedConversation\.displayName/);
  });

  it('loads no placeholder photo from a third party', () => {
    expect(index + sidebar).not.toMatch(/pravatar\.cc|picsum\.photos|placehold\.co|placeholder\.com/);
  });

  it('every button has a handler', () => {
    const pressables = sidebar.match(/<Pressable\b[\s\S]*?>/g) ?? [];
    expect(pressables.length).toBe(3);
    for (const p of pressables) expect(p).toMatch(/onPress=/);
    expect(sidebar).not.toMatch(/TouchableOpacity/);
  });

  it('its actions open the screens the phone layout uses', () => {
    expect(index).toMatch(/\/chat-details\/\$\{selectedId\}/);
    expect(index).toMatch(/\/chat-media\/\$\{selectedId\}/);
    expect(index).toMatch(/pathname:\s*'\/report'/);
  });
});
