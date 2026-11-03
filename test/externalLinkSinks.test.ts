import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isSafeExternalUrl } from '../lib/routing/urlSafety';

/**
 * A link somebody else typed must go through openExternalUrl. Linking.openURL
 * hands any scheme to the operating system: upi://pay, tel:, sms:, or a custom
 * scheme into another app, behind a card that shows only a host. In an
 * end-to-end encrypted chat the server cannot check the string, so the
 * receiving device has to.
 */
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib', 'hooks'];

/** Calls that are safe, and why. Anything else must use openExternalUrl. */
const ALLOWED: Record<string, string> = {
  'lib/routing/openExternalUrl.ts': 'the helper itself, after isSafeExternalUrl',
  'app/settings.tsx': 'openTrustedExternalUrl checks isSafeExternalUrl first',
  'components/feed/AdCard.tsx': 'checks isSafeExternalUrl before opening',
  'components/pwa/GetTheAppBanner.tsx': 'opens two constants the app builds itself',
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('opening links that other people chose', () => {
  it('no screen calls Linking.openURL on a string it did not build', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (rel in ALLOWED) continue;
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/Linking\.openURL\(/.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
      }
    }
    expect(
      offenders,
      `Linking.openURL on a user-controlled string: use openExternalUrl (lib/routing/openExternalUrl.ts), or add the file to ALLOWED here with the reason it is safe:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the allow-list honest: each allowed file still exists and still opens a URL', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(/Linking\.openURL\(/.test(text), `${rel} no longer calls Linking.openURL; remove it from ALLOWED`).toBe(true);
    }
  });
});

describe('the scheme check those links pass through', () => {
  it.each([
    'upi://pay?pa=someone@bank&am=5000',
    'tel:+911234567890',
    'tel:*21*+911234567890%23',
    'sms:+911234567890?body=hello',
    'whatsapp://send?text=hi',
    'intent://scan/#Intent;scheme=zxing;end',
    'market://details?id=com.example',
    'content://com.example/file',
    'file:///data/data/com.downloadecho.echo/databases/x',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'ftp://example.com/x',
    'http://example.com/x',
    'https://user:secret@example.com/x',
    'https://example.com/\u0000x',
    '',
  ])('refuses %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it.each(['https://example.com/a?b=c', 'https://meet.google.com/abc-defg-hij', 'mailto:someone@example.com'])(
    'opens %s',
    (url) => {
      expect(isSafeExternalUrl(url)).toBe(true);
    },
  );
});
