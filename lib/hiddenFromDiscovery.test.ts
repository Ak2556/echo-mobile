/**
 * M1 (2026-09-30 release audit): the store reviewers' account @review was
 * suggested to real users ("People to start with", the feed's follow card,
 * search). Internal accounts carry profiles.hidden_from_discovery.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const dir = resolve(root, 'supabase/migrations');
const all = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(resolve(dir, f), 'utf8').replace(/--[^\n]*/g, '')).join('\n');
const api = readFileSync(resolve(root, 'lib/supabaseEchoApi.ts'), 'utf8');
const fn = (name: string) => api.slice(api.indexOf(`export async function ${name}(`), api.indexOf('\n}\n', api.indexOf(`export async function ${name}(`)));

describe('hidden_from_discovery', () => {
  it('is readable by signed-in clients (filters need SELECT)', () => {
    expect(all).toMatch(/grant select \(hidden_from_discovery\) on public\.profiles to authenticated/i);
  });

  it('is never granted for update: only migrations and the service role set it', () => {
    expect(all).not.toMatch(/grant[^;]*update[^;]*hidden_from_discovery/i);
  });

  it('is set for the reviewers\' account', () => {
    expect(all).toMatch(/update public\.profiles set hidden_from_discovery = true where username = 'review'/i);
  });

  it('suggestions and people search exclude it', () => {
    expect(fn('fetchSuggestedUsers')).toMatch(/\.eq\('hidden_from_discovery', false\)/);
    expect(fn('searchRemoteUsers')).toMatch(/\.eq\('hidden_from_discovery', false\)/);
  });

  it('the latest get_thinking_partners excludes it', () => {
    const defs = [...all.matchAll(/create or replace function public\.get_thinking_partners[\s\S]*?\$function\$;/gi)].map(m => m[0]);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[defs.length - 1]).toMatch(/and not p\.hidden_from_discovery/);
  });
});
