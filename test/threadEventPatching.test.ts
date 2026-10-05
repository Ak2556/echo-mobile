import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hook = readFileSync('hooks/queries/useDMs.ts', 'utf8');
const api = readFileSync('lib/supabaseEchoApi.ts', 'utf8');

describe('thread realtime events patch the cache instead of refetching every page', () => {
  const realtime = hook.slice(hook.indexOf('export function useRemoteMessages'), hook.indexOf('return useInfiniteQuery<'));

  it('INSERT and UPDATE feed a batcher, not a full invalidate', () => {
    expect(realtime).toMatch(/createIdBatcher\(\{/);
    expect(realtime).toMatch(/if \(id\) batcher\.add\(id\)/);
    // The two row events point at onChange; neither is an inline invalidate any more.
    expect(realtime).not.toMatch(/event: 'INSERT'[\s\S]{0,160}=> qc\.invalidateQueries/);
    expect(realtime).not.toMatch(/event: 'UPDATE'[\s\S]{0,160}=> qc\.invalidateQueries/);
  });

  it('a (re)join and a resume still reconcile with a full refetch, and the batcher is cleaned up', () => {
    expect(realtime).toMatch(/subscribe\(catchUpOnJoin\(catchUpThread\)\)/);
    expect(realtime).toMatch(/batcher\.dispose\(\)/);
  });

  it('a successful send patches only its own row, with the full refetch as fallback', () => {
    expect(hook).toMatch(/patchThreadMessages\(qc, conversationId, \[vars\.clientId\]\)\.catch\(refetch\)/);
  });

  it('one mapper serves both a page and a single message', () => {
    expect(api).toMatch(/async function mapMessageRows\(/);
    expect(api).toMatch(/export async function fetchRemoteMessagesByIds\(/);
    expect(api).toMatch(/return mapMessageRows\(\[\.\.\.\(\(data \?\? \[\]\) as unknown as Record<string, unknown>\[\]\)\.reverse\(\), uid\)|mapMessageRows\(\[\.\.\./);
    // The select is built at call time, so a circular import cannot freeze it.
    expect(api).toMatch(/const messageSelect = \(\) => `/);
  });
});
