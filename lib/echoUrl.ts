// Public URL builder for echoes. Used by share sheet, OG fallback, and DM
// link previews.
//
// The host comes from lib/publicHost.ts rather than a literal here, because a
// share URL on a host the app has not claimed is a link that will never open
// the app. Set EXPO_PUBLIC_WEB_BASE_URL to move both at once.

import { PUBLIC_WEB_ORIGIN } from './publicHost';

export function publicWebUrl(path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_WEB_ORIGIN}${normalizedPath}`;
}

export function echoUrl(echoId: string): string {
  return publicWebUrl(`/e/${encodeURIComponent(echoId)}`);
}

export function userUrl(username: string): string {
  return publicWebUrl(`/u/${encodeURIComponent(username)}`);
}

export function commentUrl(commentId: string): string {
  return publicWebUrl(`/c/${encodeURIComponent(commentId)}`);
}
