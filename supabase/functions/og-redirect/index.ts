// Returns a tiny HTML doc with OG tags and a client-side redirect to the SPA.
// Crawlers (Slack, iMessage, Twitter) read meta; humans get redirected.
//
// GET /functions/v1/og-redirect?id=<echoId>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEB_BASE = Deno.env.get('WEB_BASE_URL') ?? 'https://echo.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';

  let title = 'Echo';
  let description = 'A social platform where AI conversations become content.';
  let image = `${WEB_BASE}/og-default.png`;

  if (id) {
    const { data } = await supabase
      .from('public_echoes')
      .select('title, prompt, response, media_urls')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      title = data.title || data.prompt?.slice(0, 80) || title;
      description = (data.response || data.prompt || description).slice(0, 200);
      if (Array.isArray(data.media_urls) && data.media_urls[0]) image = data.media_urls[0];
    }
  }

  const target = id ? `${WEB_BASE}/e/${encodeURIComponent(id)}` : WEB_BASE;
  const html = `<!doctype html><html><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}" />
</head><body><script>location.replace(${JSON.stringify(target)});</script>
<p>Redirecting to <a href="${escapeHtml(target)}">${escapeHtml(target)}</a>…</p>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
});
