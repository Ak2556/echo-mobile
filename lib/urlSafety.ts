const TRUSTED_WEB_HOSTS = new Set(['echo.app', 'www.echo.app']);
const AUTH_CALLBACK_PATHS = new Set(['/auth/callback']);
const AUTH_CALLBACK_SCHEME_HOSTS = new Set(['auth']);
const ROUTE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const ENCODED_CONTROL_CHARACTER_PATTERN = /%(?:0[0-9A-F]|1[0-9A-F]|7F)/i;

export type EchoUniversalLinkRoute =
  | { kind: 'echo'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'comment'; id: string };

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hasTrustedWebHost(parsed: URL): boolean {
  return parsed.protocol === 'https:' && TRUSTED_WEB_HOSTS.has(parsed.hostname.toLowerCase());
}

function pathSegments(parsed: URL): string[] {
  const normalized = parsed.pathname.replace(/^\/+|\/+$/g, '');
  return normalized ? normalized.split('/') : [];
}

export function safeRouteId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ROUTE_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function isAllowedAuthCallbackUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;

  if (hasTrustedWebHost(parsed)) {
    return AUTH_CALLBACK_PATHS.has(parsed.pathname);
  }

  if (parsed.protocol !== 'echo:') return false;

  if (AUTH_CALLBACK_SCHEME_HOSTS.has(parsed.hostname.toLowerCase())) {
    return parsed.pathname === '/callback';
  }

  return !parsed.hostname && AUTH_CALLBACK_PATHS.has(parsed.pathname);
}

export function parseEchoUniversalLink(url: string): EchoUniversalLinkRoute | null {
  const parsed = parseUrl(url);
  if (!parsed || !hasTrustedWebHost(parsed)) return null;

  const segments = pathSegments(parsed);
  if (segments.length !== 2) return null;

  const [prefix, rawId] = segments;
  const id = safeRouteId(rawId);
  if (!id) return null;

  if (prefix === 'e') return { kind: 'echo', id };
  if (prefix === 'u') return { kind: 'user', id };
  if (prefix === 'c') return { kind: 'comment', id };
  return null;
}

export function isSafeExternalUrl(url: string): boolean {
  if (
    !url ||
    url.length > 2048 ||
    CONTROL_CHARACTER_PATTERN.test(url) ||
    ENCODED_CONTROL_CHARACTER_PATTERN.test(url)
  ) {
    return false;
  }
  const parsed = parseUrl(url);
  if (!parsed) return false;

  if (parsed.protocol === 'https:') {
    return Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  }

  return parsed.protocol === 'mailto:';
}
