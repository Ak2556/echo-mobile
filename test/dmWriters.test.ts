import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The previous encryption attempt died because a second write path sent
 * plaintext and nobody noticed. There is now exactly one: lib/e2ee/messages.ts.
 * Anything else that inserts a DM row, or calls the sealed-send RPC, fails here.
 */
const ROOT = resolve(__dirname, '..');
const ALLOWED = 'lib/e2ee/messages.ts';

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules') return [];
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) return files(rel);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

describe('direct message writers', () => {
  it('only lib/e2ee/messages.ts inserts into direct_messages or calls send_encrypted_dm', () => {
    const offenders = ['lib', 'src', 'hooks', 'app', 'components', 'store']
      .flatMap(files)
      .filter(file => {
        const code = readFileSync(join(ROOT, file), 'utf8');
        return /from\(\s*['"]direct_messages['"]\s*\)\s*\.insert\(/.test(code) || /send_encrypted_dm/.test(code);
      })
      .map(file => relative(ROOT, join(ROOT, file)));
    expect(offenders).toEqual([ALLOWED]);
  });
});
