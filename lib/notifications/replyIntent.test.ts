import { describe, expect, it } from 'vitest';
import {
  ACTION_REPLY,
  CATEGORY_COMMENT,
  CATEGORY_DM,
  MAX_REPLY_LENGTH,
  categoryForKind,
  resolveReplyIntent,
} from './replyIntent';
import { channelForKind, CHANNEL_DAILY, CHANNEL_MESSAGES, CHANNEL_SOCIAL, CHANNEL_SYSTEM } from './channels';

const uuid = '11111111-2222-3333-4444-555555555555';

describe('resolveReplyIntent', () => {
  it('turns a DM reply into a conversation send', () => {
    expect(resolveReplyIntent(ACTION_REPLY, 'on my way', { kind: 'dm', target_id: uuid }))
      .toEqual({ kind: 'dm', conversationId: uuid, text: 'on my way' });
  });

  it('turns a comment reply into a comment on that echo', () => {
    expect(resolveReplyIntent(ACTION_REPLY, 'agreed', { kind: 'comment', target_id: uuid }))
      .toEqual({ kind: 'comment', echoId: uuid, text: 'agreed' });
  });

  it('accepts mentions and quotes as commentable', () => {
    for (const kind of ['mention', 'quote']) {
      expect(resolveReplyIntent(ACTION_REPLY, 'hi', { kind, target_id: uuid })?.kind).toBe('comment');
    }
  });

  it('ignores a plain tap', () => {
    // DEFAULT_ACTION_IDENTIFIER must fall through to the tap router, or every
    // opened notification would try to post an empty reply.
    expect(resolveReplyIntent('expo.modules.notifications.actions.DEFAULT', 'x', { kind: 'dm', target_id: uuid }))
      .toBeNull();
  });

  it('refuses to post an empty or whitespace-only reply', () => {
    expect(resolveReplyIntent(ACTION_REPLY, '   ', { kind: 'dm', target_id: uuid })).toBeNull();
    expect(resolveReplyIntent(ACTION_REPLY, undefined, { kind: 'dm', target_id: uuid })).toBeNull();
  });

  it('trims before measuring, and caps length', () => {
    const long = 'a'.repeat(MAX_REPLY_LENGTH + 500);
    const r = resolveReplyIntent(ACTION_REPLY, ` ${long} `, { kind: 'dm', target_id: uuid });
    expect(r?.text).toHaveLength(MAX_REPLY_LENGTH);
  });

  it('rejects a target id that is not a safe route id', () => {
    // The payload arrives from the network; a crafted target_id must never
    // reach a query.
    expect(resolveReplyIntent(ACTION_REPLY, 'hi', { kind: 'dm', target_id: '../../admin' })).toBeNull();
    expect(resolveReplyIntent(ACTION_REPLY, 'hi', { kind: 'dm', target_id: null })).toBeNull();
  });

  it('will not reply to kinds where a reply has no meaning', () => {
    // Typing into a "someone liked your echo" notification must not silently
    // publish a public comment on your own post.
    for (const kind of ['like', 'follow', 'repost', 'reaction', 'bookmark', 'daily_question']) {
      expect(resolveReplyIntent(ACTION_REPLY, 'hi', { kind, target_id: uuid })).toBeNull();
    }
  });

  it('survives a missing data payload', () => {
    expect(resolveReplyIntent(ACTION_REPLY, 'hi', null)).toBeNull();
    expect(resolveReplyIntent(ACTION_REPLY, 'hi', {})).toBeNull();
  });
});

describe('categoryForKind', () => {
  it('stamps a category only on kinds resolveReplyIntent will accept', () => {
    expect(categoryForKind('dm')).toBe(CATEGORY_DM);
    expect(categoryForKind('comment')).toBe(CATEGORY_COMMENT);
    expect(categoryForKind('like')).toBeNull();
  });

  it('agrees with resolveReplyIntent on every kind', () => {
    // A category without a resolver puts a Reply button on a notification that
    // silently drops what the user types — the exact failure worth pinning.
    const kinds = ['dm', 'comment', 'mention', 'quote', 'like', 'follow', 'repost',
                   'reaction', 'bookmark', 'friend_post', 'daily_question', 'daily_react',
                   'personal_nudge', 'appeal_resolved', 'content_removed'];
    for (const kind of kinds) {
      const hasCategory = categoryForKind(kind) !== null;
      const resolves = resolveReplyIntent(ACTION_REPLY, 'hi', { kind, target_id: uuid }) !== null;
      expect(hasCategory, `mismatch for ${kind}`).toBe(resolves);
    }
  });
});

describe('channelForKind', () => {
  it('separates the interruptions users tune independently', () => {
    expect(channelForKind('dm')).toBe(CHANNEL_MESSAGES);
    expect(channelForKind('like')).toBe(CHANNEL_SOCIAL);
    expect(channelForKind('daily_question')).toBe(CHANNEL_DAILY);
    expect(channelForKind('content_removed')).toBe(CHANNEL_SYSTEM);
  });

  it('sends an unknown kind to the quietest channel a stranger can reach', () => {
    expect(channelForKind('something_new')).toBe(CHANNEL_SOCIAL);
    expect(channelForKind(undefined)).toBe(CHANNEL_SOCIAL);
  });
});
