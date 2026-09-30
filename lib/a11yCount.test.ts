import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countLabel } from './a11yCount';

const src = (p: string) => readFileSync(p, 'utf8');

describe('countLabel', () => {
  it('pluralises', () => {
    expect(countLabel(1, 'comment', 'comments')).toBe('1 comment');
    expect(countLabel(4, 'comment', 'comments')).toBe('4 comments');
    expect(countLabel(0, 'follower', 'followers')).toBe('0 followers');
    expect(countLabel(undefined, 'like', 'likes')).toBe('0 likes');
  });
});

// 2026-09-30 audit, low-severity items.
describe('audit fixes', () => {
  it('L2: the dismiss label is spelled right', () => {
    expect(src('src/shared/lib/i18n.ts')).toMatch(/'home\.dismissThought': "Dismiss today's thought"/);
  });

  it('L3/L5: count buttons say what they count', () => {
    expect(src('src/features/feed/ui/FeedCard.tsx')).not.toMatch(/Comment\. \$\{item\.commentCount \|\| 0\} comments/);
    expect(src('app/thread/[id].tsx')).toMatch(/countLabel\(item\.commentCount/);
    expect(src('app/user/[id].tsx')).toMatch(/countLabel\(user\.followerCount/);
  });

  it('L6: a similar-conversation card never repeats its title as the preview', () => {
    expect(src('src/features/feed/ui/SimilarEchoesRail.tsx')).toMatch(/\.find\(text => !!text && text !== title\)/);
  });

  it('L12: story screens are behind the stories flag like the other flagged-off routes', () => {
    for (const p of ['app/story.tsx', 'app/create-story.tsx']) {
      expect(src(p)).toMatch(/<V2FeatureGuard flag="stories">/);
    }
  });

  it('N2: Flow cards clear the floating tab bar with the shared padding', () => {
    expect(src('src/features/feed/ui/FlowCard.tsx')).toMatch(/paddingBottom: layout\.bottomChromePadding/);
  });
});
