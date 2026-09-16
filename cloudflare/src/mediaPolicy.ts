/**
 * What the media worker agrees to store and serve, and in what form.
 *
 * A presigned PUT lets the uploader pick any Content-Type, and /media hands
 * that type straight back to the browser. Without this module, any account
 * could host an HTML page, an SVG with script in it, or an APK on the same
 * origin that serves Echo's real download. Refusing some names at upload and
 * normalising what is served closes that without touching the app, which
 * already uploads only images, video and audio.
 */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Types the app actually renders. Everything else is served as a download. */
const INLINE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/mp2t',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/x-caf',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
]);

/**
 * Extensions an upload may not carry: anything a browser or a phone treats as
 * a page, a script or an installer. A denylist rather than an allowlist,
 * because the mini-apps derive extensions from file names and a stricter rule
 * would reject ordinary uploads. What the list misses, mediaHeaders catches.
 */
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  'apk', 'aab', 'apks', 'xapk', 'ipa', 'exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'jar',
  'html', 'htm', 'xhtml', 'xht', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'xslt',
  'js', 'mjs', 'cjs', 'wasm', 'swf', 'hta', 'jnlp', 'crx', 'xpi',
  'php', 'phtml', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'wsf',
  'lnk', 'reg', 'dll', 'so', 'dylib',
]);

/** Control characters, DEL and percent-encoding: none belong in a key the app builds itself. */
const UNSAFE_KEY_CHARACTERS = /[\x00-\x1f\x7f%]/;

export function uploadPathAllowed(path: string): boolean {
  if (!path || path.length > 512 || path.includes('..') || path.includes('\\')) return false;
  if (UNSAFE_KEY_CHARACTERS.test(path)) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot === -1) return true;
  return !BLOCKED_UPLOAD_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Headers for a /media response, derived from what R2 stored.
 *
 * Every response gets nosniff and a sandboxing CSP. Opening a media URL as a
 * page can never run script, even for an object stored before this existed.
 * Types outside INLINE_MEDIA_TYPES become an octet-stream attachment named
 * download.bin, which a phone will not offer to install whatever the key ends
 * in.
 *
 * downloads/ is the one prefix only the operator can write (upload paths have
 * to start with a user id), so it keeps its stored type. That is what lets
 * Echo's own APK install.
 */
export function mediaHeaders(stored: Headers, key: string): Headers {
  const headers = new Headers(stored);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  if (key.startsWith('downloads/')) return headers;

  const type = (headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!INLINE_MEDIA_TYPES.has(type)) {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', 'attachment; filename="download.bin"');
  } else {
    headers.delete('Content-Disposition');
  }
  return headers;
}

/** A DM media key names its conversation: `${conversationId}/${timestamp}.ext`. */
export function dmConversationFromKey(key: string): string | null {
  const segments = key.split('/');
  return segments.length >= 2 && UUID_PATTERN.test(segments[0]) ? segments[0] : null;
}

/** Clamp a requested presign lifetime to [60s, 6h]. Anything unparseable gets an hour. */
export function presignTtl(requested: string | undefined, fallback = 3600): number {
  const n = Number(requested);
  if (!requested || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 60), 6 * 60 * 60);
}
