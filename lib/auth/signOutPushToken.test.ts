import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A signed-out account must stop receiving notifications on this device. The
// delete needs the session, so it has to run before supabase.auth.signOut.
describe('signOut and the push token', () => {
  const src = readFileSync('lib/auth/index.ts', 'utf8');
  const body = src.slice(src.indexOf('export async function signOut'));

  it('removes this device from the account before the session is destroyed', () => {
    const clear = body.indexOf('clearPushToken()');
    const out = body.indexOf('supabase.auth.signOut');
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(out);
  });

  it('cannot hang sign-out on the network', () => {
    expect(body).toMatch(/Promise\.race\(\[\s*clearPushToken\(\)\.catch\(\(\) => \{\}\),\s*new Promise<void>\(\(resolve\) => setTimeout\(resolve, 3000\)\)/);
  });
});
