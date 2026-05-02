// Public URL builder for echoes. Used by share sheet, OG fallback, and DM
// link previews. Set EXPO_PUBLIC_WEB_BASE_URL to your hosted web build.

const BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://echo.app';

export function echoUrl(echoId: string): string {
  return `${BASE}/e/${encodeURIComponent(echoId)}`;
}

export function userUrl(username: string): string {
  return `${BASE}/u/${encodeURIComponent(username)}`;
}
