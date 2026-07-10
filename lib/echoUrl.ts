// Public URL builder for echoes. Used by share sheet, OG fallback, and DM
// link previews. Set EXPO_PUBLIC_WEB_BASE_URL to your hosted web build.

const BASE = (process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://echo.app').replace(/\/+$/, '');

export function publicWebUrl(path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${normalizedPath}`;
}

export function echoUrl(echoId: string): string {
  return publicWebUrl(`/e/${encodeURIComponent(echoId)}`);
}

export function userUrl(username: string): string {
  return publicWebUrl(`/u/${encodeURIComponent(username)}`);
}
