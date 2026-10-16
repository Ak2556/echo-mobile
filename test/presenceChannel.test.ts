/**
 * Presence used to run on one global, public Realtime channel that handed every client the whole online
 * list, enforced only in the client. It runs through get_presence now. This keeps the channel, the old
 * hook, and the last-seen column from creeping back into the client.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) yield* sources(rel);
    else if (/\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel)) yield rel;
  }
}
const all = ['app', 'lib', 'components', 'hooks', 'store'].flatMap(d => [...sources(d)]).map(f => [f, readFileSync(join(ROOT, f), 'utf8')] as const);

describe('presence stays behind get_presence', () => {
  it('no client opens the global online-users channel', () => {
    const hits = all.filter(([, t]) => /channel\(\s*['"`]online-users/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('the old tracking hook is gone', () => {
    const hits = all.filter(([, t]) => /usePresenceTracking/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('no client selects profiles.last_seen_at (old builds still do; new ones must not)', () => {
    const hits = all.filter(([, t]) => /avatar_url, last_seen_at/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('the theme reads presence from the core store, not the API layer', () => {
    const theme = readFileSync(join(ROOT, 'lib/ui/theme.ts'), 'utf8');
    expect(theme).toMatch(/social\/presenceCore/);
    expect(theme).not.toMatch(/social\/presence['"]/);
  });
});
