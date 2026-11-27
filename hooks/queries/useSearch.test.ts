import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseEchoApi', () => ({ searchRemoteProfiles: vi.fn(), searchRemoteEchoes: vi.fn() }));
vi.mock('../../lib/core/remoteConfig', () => ({ isSupabaseRemote: () => true }));
const { topicMatchesFrom } = await import('./useSearch');

// 2026-11-27: searching "nature" offered #echo and #newpost, hashtags of a post
// that matched, not topics that matched.
describe('topicMatchesFrom', () => {
  it('keeps only topics whose name contains the query', () => {
    const posts = [{ hashtags: ['nature', 'echo', 'newpost'] }, { hashtags: ['Naturelover'] }];
    expect(topicMatchesFrom(posts, 'nature').map(t => t.topic)).toEqual(['nature', 'Naturelover']);
  });

  it('accepts a leading #', () => {
    expect(topicMatchesFrom([{ hashtags: ['nature'] }], '#nat')).toEqual([{ topic: 'nature', count: 1 }]);
  });
});
