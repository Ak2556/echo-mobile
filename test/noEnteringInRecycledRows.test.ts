import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-11-27: a Tools tile froze part-way through its entering animation on an
// iPhone (one invisible, one drawn over its neighbour). A FlashList recycles a
// row's view for another item while scrolling, so an entering animation there
// can be cut off the same way. These rows render inside a FlashList.
const ROWS: [string, (src: string) => string][] = [
  ['app/messages/index.tsx', s => s.slice(s.indexOf('function ConversationCard'), s.indexOf('function InboxHero'))],
  ['app/blocked-users.tsx', s => s.slice(s.indexOf('<FlashList'))],
  ['app/muted-users.tsx', s => s.slice(s.indexOf('<FlashList'))],
  ['app/thinking-partners.tsx', s => s],
  ['components/feed/CommentCard.tsx', s => s],
  ['components/feed/FeedCard.tsx', s => s],
];

describe('rows of a recycling list have no entering animation', () => {
  for (const [file, part] of ROWS) {
    it(file, () => {
      const src = part(readFileSync(file, 'utf8'));
      expect(src).not.toMatch(/entering=\{(?!undefined\}|entering\})/);
    });
  }

  it('FeedCard keeps its entering prop switched off', () => {
    expect(readFileSync('components/feed/FeedCard.tsx', 'utf8')).toMatch(/const entering = undefined;/);
  });
});
