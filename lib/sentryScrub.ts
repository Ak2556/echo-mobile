// What leaves the phone in a Sentry report.
//
// sendDefaultPii is off, so Sentry already skips IPs and cookies on its own.
// What it still collects is breadcrumbs: every fetch URL, and Supabase puts its
// filters in the query string (profiles?username=eq.…, dm?peer=eq.<uuid>), plus
// console lines and the raw objects passed to them. Error messages from Postgres
// quote the offending value too ("Key (email)=(…) already exists"). This pass
// keeps the shape of what happened and drops who it happened to.

type Json = unknown;

export interface ScrubbableBreadcrumb {
  type?: string;
  category?: string;
  message?: string;
  data?: Record<string, Json>;
  [key: string]: Json;
}

export interface ScrubbableEvent {
  message?: string;
  user?: Record<string, Json> & { id?: string };
  request?: { url?: string; query_string?: Json; [key: string]: Json };
  exception?: { values?: { type?: string; value?: string; [key: string]: Json }[] };
  extra?: Record<string, Json>;
  breadcrumbs?: ScrubbableBreadcrumb[];
  spans?: { description?: string; data?: Record<string, Json>; [key: string]: Json }[];
  [key: string]: Json;
}

const URL_QUERY = /(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function redact(text: string): string {
  return text
    .replace(URL_QUERY, '$1?[query]')
    .replace(JWT, '[token]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]');
}

function redactDeep(value: Json, depth = 0): Json {
  if (typeof value === 'string') return redact(value);
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => redactDeep(v, depth + 1));
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value as Record<string, Json>)) out[k] = redactDeep(v, depth + 1);
  return out;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(b: B): B | null {
  const data = b.data ? { ...b.data } : undefined;
  // Console breadcrumbs carry the logged objects verbatim; the message is enough.
  if (data && b.category === 'console') delete data.arguments;
  return {
    ...b,
    message: typeof b.message === 'string' ? redact(b.message) : b.message,
    data: data ? (redactDeep(data) as Record<string, Json>) : undefined,
  };
}

export function scrubEvent<E extends ScrubbableEvent>(e: E): E {
  const out: E = { ...e };
  // The id is how a report is matched to a support request; nothing else is needed.
  if (e.user) out.user = e.user.id ? { id: e.user.id } : undefined;
  if (typeof e.message === 'string') out.message = redact(e.message);
  if (e.request) {
    out.request = { ...e.request, url: e.request.url ? redact(e.request.url) : e.request.url };
    delete out.request.query_string;
  }
  if (e.exception?.values) {
    out.exception = {
      ...e.exception,
      values: e.exception.values.map(v => ({ ...v, value: typeof v.value === 'string' ? redact(v.value) : v.value })),
    };
  }
  if (e.extra) out.extra = redactDeep(e.extra) as Record<string, Json>;
  // Performance spans name each request by its full URL ("GET https://…?peer=eq.…").
  if (e.spans) {
    out.spans = e.spans.map(sp => ({
      ...sp,
      description: typeof sp.description === 'string' ? redact(sp.description) : sp.description,
      data: sp.data ? (redactDeep(sp.data) as Record<string, Json>) : sp.data,
    }));
  }
  if (e.breadcrumbs) {
    out.breadcrumbs = e.breadcrumbs.map(b => scrubBreadcrumb(b)).filter((b): b is ScrubbableBreadcrumb => b !== null);
  }
  return out;
}
