import { describe, expect, it } from 'vitest';
import { dmConversationFromKey, mediaHeaders, presignTtl, uploadPathAllowed } from './mediaPolicy';

const UID = '5c6f0d6e-8a53-4b8e-9d0f-0a1b2c3d4e5f';
const CONTROL = String.fromCharCode(1);

describe('uploadPathAllowed', () => {
  it.each([
    `${UID}/1787386061572_0.jpg`,
    `${UID}/1787386061572_video.mp4`,
    `${UID}/voice-memo/1787386061572-abcd1234.m4a`,
    `${UID}/studio/1787386061572-abcd1234.bin`,
    `${UID}/avatar.heic`,
    `${UID}/no-extension`,
  ])('accepts what the app uploads: %s', path => {
    expect(uploadPathAllowed(path)).toBe(true);
  });

  it.each([
    [`${UID}/echo-latest.apk`, 'an installer next to the real download'],
    [`${UID}/Echo.APK`, 'case does not matter'],
    [`${UID}/login.html`, 'a page on the media origin'],
    [`${UID}/logo.svg`, 'svg carries script'],
    [`${UID}/x.jpg.js`, 'only the last extension counts'],
    [`${UID}/../other/a.jpg`, 'traversal'],
    [`${UID}\\a.jpg`, 'backslash'],
    [`${UID}/a%2F.jpg`, 'percent-encoding'],
    [`${UID}/a${CONTROL}.jpg`, 'control character'],
    [`${UID}/${'a'.repeat(600)}.jpg`, 'overlong'],
    ['', 'empty'],
  ])('refuses %s (%s)', path => {
    expect(uploadPathAllowed(path)).toBe(false);
  });
});

describe('mediaHeaders', () => {
  const stored = (type: string) => new Headers({ 'Content-Type': type });

  it('keeps media inline and adds the hardening headers', () => {
    const h = mediaHeaders(stored('image/jpeg'), `${UID}/a.jpg`);
    expect(h.get('Content-Type')).toBe('image/jpeg');
    expect(h.get('Content-Disposition')).toBeNull();
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('Content-Security-Policy')).toContain('sandbox');
  });

  it.each(['text/html', 'image/svg+xml', 'application/javascript', 'application/vnd.android.package-archive', ''])(
    'turns %s into a download that cannot be installed or rendered',
    type => {
      const h = mediaHeaders(stored(type), `${UID}/a.jpg`);
      expect(h.get('Content-Type')).toBe('application/octet-stream');
      expect(h.get('Content-Disposition')).toBe('attachment; filename="download.bin"');
    },
  );

  it('ignores type parameters and case', () => {
    expect(mediaHeaders(stored('Video/MP4; codecs="avc1"'), `${UID}/v.mp4`).get('Content-Disposition')).toBeNull();
  });

  it('leaves the operator-only downloads/ prefix alone, so the real APK still installs', () => {
    const h = mediaHeaders(stored('application/vnd.android.package-archive'), 'downloads/echo-latest.apk');
    expect(h.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('dmConversationFromKey', () => {
  it('reads the conversation from a current key', () => {
    expect(dmConversationFromKey(`${UID}/1787386061572.jpg`)).toBe(UID);
  });
  it('returns null for a legacy key with no conversation', () => {
    expect(dmConversationFromKey('1787386061572.jpg')).toBeNull();
    expect(dmConversationFromKey('not-a-uuid/1.jpg')).toBeNull();
  });
});

describe('presignTtl', () => {
  it.each([
    [undefined, 3600],
    ['', 3600],
    ['abc', 3600],
    ['10', 60],
    ['900', 900],
    ['999999', 21600],
  ])('%s -> %s', (input, expected) => {
    expect(presignTtl(input)).toBe(expected);
  });
});
