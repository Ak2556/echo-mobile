import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The DM screen has two message renderers in the tree.
 *
 * `memoizedFlashList` is the real one: it renders DMBubble, which has branches
 * for image, voice, shared echo, link, contact and time-capsule messages, plus
 * date separators, the unread divider, reactions, read receipts, reply context,
 * swipe-to-reply and pagination.
 *
 * `VirtualizedChatFeed` is a stub from the WatermelonDB spike (176afc8). It
 * renders `item.content` and `item.senderId` and nothing else. Because the
 * normalizer moves non-text payloads out of `content` — into sharedEchoTitle,
 * mediaUrl, contactUsername and so on — every non-text message renders as an
 * empty bubble under the stub, and a voice note renders as its raw duration
 * ("6", "12"), since that is what `text` holds for kind='voice'.
 *
 * 176afc8 swapped the JSX to the stub and commented out useRemoteMessages. A
 * later commit restored the fetch but not the renderer, so the thread showed
 * real messages through the stub for four days.
 */

const SCREEN = resolve(__dirname, '../app/messages/[id].tsx');

describe('DM screen message renderer', () => {
  const src = readFileSync(SCREEN, 'utf8');

  it('renders the rich list, not the content-only stub', () => {
    // The stub may still be imported by dead code elsewhere; what matters is
    // that this screen does not render it.
    expect(src, 'the DM thread must not render VirtualizedChatFeed').not.toMatch(/<VirtualizedChatFeed\b/);
    expect(src, 'the DM thread must render memoizedFlashList').toMatch(/\{\s*memoizedFlashList\s*\}/);
  });

  it('keeps the remote message fetch wired up', () => {
    // The same commit stubbed these out; a commented-out fetch means an empty
    // thread rather than a mis-rendered one.
    expect(src).toMatch(/^\s*const \{ data: remoteMessagePages, fetchNextPage, hasNextPage \} = useRemoteMessages\(/m);
    expect(src).toMatch(/^\s*const remoteMessages = /m);
  });
});
