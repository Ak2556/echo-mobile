// Lightweight URL detection + best-effort OG fetch. Skips on native (no DOM
// parser) and uses regex-only on web to keep deps zero. Production pipelines
// should swap this for a proper OG service.

export interface LinkPreviewMeta {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

const URL_RE = /(https?:\/\/[^\s]+)/i;

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  return match?.[1] ?? null;
}

export async function fetchLinkPreview(url: string, opts: { timeoutMs?: number } = {}): Promise<LinkPreviewMeta | null> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'EchoBot/1.0 (+link preview)' } });
    clearTimeout(t);
    const html = await res.text();
    return parseOgFromHtml(html, url);
  } catch {
    return null;
  }
}

function parseOgFromHtml(html: string, fallbackUrl: string): LinkPreviewMeta {
  const meta: LinkPreviewMeta = { url: fallbackUrl };
  const re = /<meta\s+(?:property|name)=['"]([^'"]+)['"]\s+content=['"]([^'"]*)['"]\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const k = m[1].toLowerCase();
    const v = m[2];
    if (k === 'og:title' || (k === 'twitter:title' && !meta.title)) meta.title = v;
    else if (k === 'og:description' || (k === 'twitter:description' && !meta.description)) meta.description = v;
    else if (k === 'og:image' || (k === 'twitter:image' && !meta.image)) meta.image = v;
  }
  if (!meta.title) {
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) meta.title = t[1].trim();
  }
  return meta;
}
