import type { VideoSource } from 'expo-video';

export type VideoContentKind = 'hls' | 'progressive' | 'auto';

const VIDEO_EXTENSION_RE = /\.(mp4|m4v|mov|webm|m3u8|x-m4v)(?:[?#]|$)/i;
const VIDEO_MIME_RE = /(?:^|[?&#=/])video(?:%2[fF]|\/)(?:mp4|quicktime|x-m4v|webm|mpegurl|x-mpegurl)/i;

export function isVideoUri(uri: string | undefined | null): uri is string {
  if (!uri) return false;
  return VIDEO_EXTENSION_RE.test(uri) || VIDEO_MIME_RE.test(uri);
}

export function videoContentKind(uri: string): VideoContentKind {
  if (/\.m3u8(?:[?#]|$)/i.test(uri) || /mpegurl/i.test(uri)) return 'hls';
  if (isVideoUri(uri)) return 'progressive';
  return 'auto';
}

export function videoSourceForUri(uri: string | undefined | null): VideoSource {
  if (!uri) return null;
  const contentType = videoContentKind(uri);
  return contentType === 'auto' ? { uri } : { uri, contentType };
}
