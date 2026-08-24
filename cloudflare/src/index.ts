import { Hono } from 'hono';
import { AwsClient } from 'aws4fetch';

type Bindings = {
  /** Supabase project URL. Set via `wrangler secret put SUPABASE_URL`. */
  SUPABASE_URL: string;
  /** Supabase publishable (anon) key. Safe to expose, but not to hardcode. */
  SUPABASE_ANON_KEY: string;
  /**
   * Shared secret for POST /purge-user. Only the account-deletion edge function
   * knows it. `wrangler secret put PURGE_SECRET`.
   */
  PURGE_SECRET: string;

  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;

  AVATARS_BUCKET: R2Bucket;
  ECHO_MEDIA_BUCKET: R2Bucket;
  DM_MEDIA_BUCKET: R2Bucket;
  MINI_APP_MEDIA_BUCKET: R2Bucket;
  MARKETPLACE_PHOTOS_BUCKET: R2Bucket;
};

type Vars = { user_id: string; access_token: string };

const app = new Hono<{ Bindings: Bindings; Variables: Vars }>();

const ALLOWED_BUCKETS = ['avatars', 'echo-media', 'dm-media', 'mini-app-media', 'marketplace-photos'] as const;
type BucketName = (typeof ALLOWED_BUCKETS)[number];

function bucketBinding(env: Bindings, name: BucketName): R2Bucket {
  switch (name) {
    case 'avatars': return env.AVATARS_BUCKET;
    case 'echo-media': return env.ECHO_MEDIA_BUCKET;
    case 'dm-media': return env.DM_MEDIA_BUCKET;
    case 'mini-app-media': return env.MINI_APP_MEDIA_BUCKET;
    case 'marketplace-photos': return env.MARKETPLACE_PHOTOS_BUCKET;
  }
}

/**
 * Delete every object under `${userId}/` in one bucket.
 * R2 lists 1000 keys at a time, so this pages until the listing is exhausted.
 */
async function purgePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = listing.objects.map(o => o.key);
    if (keys.length) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return deleted;
}

// ── service-to-service purge ────────────────────────────────────────────────
// Registered BEFORE the user-auth middleware: this caller is the account
// deletion edge function holding a shared secret, not a signed-in user.
app.post('/purge-user', async (c) => {
  const provided = c.req.header('X-Purge-Secret');
  const expected = c.env.PURGE_SECRET;

  if (!expected) return c.json({ error: 'Purge is not configured' }, 503);
  // Constant-length compare; these are short strings so a plain !== leaks
  // little, but there is no reason to be sloppy about it.
  if (!provided || provided.length !== expected.length || provided !== expected) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req
    .json<{ user_id?: string }>()
    .catch(() => ({}) as { user_id?: string });
  const userId = body.user_id;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return c.json({ error: 'A valid user_id is required' }, 400);
  }

  const prefix = `${userId}/`;
  const result: Record<string, number> = {};
  for (const name of ALLOWED_BUCKETS) {
    try {
      result[name] = await purgePrefix(bucketBinding(c.env, name), prefix);
    } catch (err) {
      // Report per-bucket rather than failing the whole purge — a partial
      // purge that reports honestly is better than an opaque 500.
      result[name] = -1;
    }
  }

  const failed = Object.values(result).some(n => n < 0);
  return c.json({ user_id: userId, deleted: result }, failed ? 207 : 200);
});

// ── public media read ───────────────────────────────────────────────────────
// Registered BEFORE the user-auth middleware, and deliberately so: feed images
// and avatars are rendered by <Image source={{ uri }} />, which has no way to
// attach an Authorization header. Before the R2 migration these lived on
// Supabase Storage under /object/public/..., so serving them unauthenticated
// restores the previous boundary rather than widening it.
//
// dm-media is deliberately absent. It stays behind /dm-media/:userId/:filename,
// which checks conversation membership.
const PUBLIC_READ_BUCKETS = ['avatars', 'echo-media', 'mini-app-media', 'marketplace-photos'] as const;

app.get('/media/:bucket/:key{.+}', async (c) => {
  const bucket = c.req.param('bucket');
  const key = c.req.param('key');

  if (!(PUBLIC_READ_BUCKETS as readonly string[]).includes(bucket)) {
    // Covers both unknown buckets and dm-media, which must not be readable here.
    return c.text('Not Found', 404);
  }
  if (key.includes('..')) return c.text('Bad Request', 400);

  // workers.dev applies no zone caching, so without this every view of the same
  // image costs a worker invocation and an R2 read. Responses carry
  // `immutable` already; this is what makes the edge honour it.
  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const object = await bucketBinding(c.env, bucket as BucketName).get(key);
  if (!object) return c.text('Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers); // content-type, as stored on upload
  headers.set('etag', object.httpEtag);
  // Keys embed an upload timestamp and are never rewritten, so a hit is safe to
  // cache indefinitely.
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  const res = new Response(object.body, { headers });
  // Cache after responding — the user should not wait on the write. Only the
  // public buckets reach here; dm-media is served by its own gated route and is
  // deliberately never edge-cached.
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});

// ── user auth ───────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  const supabaseUrl = c.env.SUPABASE_URL;
  const anonKey = c.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return c.json({ error: 'Auth is not configured' }, 503);
  }

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return c.json({ error: 'Invalid Supabase token' }, 401);

    const user = await userRes.json<{ id?: string }>();
    if (!user?.id) return c.json({ error: 'Invalid Supabase token' }, 401);

    c.set('user_id', user.id);
    c.set('access_token', token);
    await next();
  } catch {
    return c.json({ error: 'Authentication failed' }, 401);
  }
});

// ── signed upload ───────────────────────────────────────────────────────────
app.get('/upload-url', async (c) => {
  const bucket = c.req.query('bucket');
  const path = c.req.query('path');
  const userId = c.get('user_id');

  if (!bucket || !path) {
    return c.json({ error: 'Missing bucket or path query parameters' }, 400);
  }
  if (!ALLOWED_BUCKETS.includes(bucket as BucketName)) {
    return c.json({ error: 'Invalid bucket' }, 400);
  }
  // Users may only write inside their own directory.
  if (!path.startsWith(`${userId}/`) || path.includes('..')) {
    return c.json({ error: 'Unauthorized path. You can only upload to your own directory.' }, 403);
  }

  const r2Client = new AwsClient({
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const url = new URL(`https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${path}`);
  const signedRequest = await r2Client.sign(new Request(url, { method: 'PUT' }), {
    aws: { signQuery: true },
  });

  return c.json({
    signedUrl: signedRequest.url,
    // Served back through this worker's own public read route. The previous
    // value was `https://pub-${R2_ACCOUNT_ID}.r2.dev/${path}` — a placeholder
    // that dropped the bucket segment and used the account id where r2.dev
    // expects a per-bucket public hash, so every URL it produced returned 401.
    // Deriving the origin from the request keeps this correct on workers.dev
    // and on any custom domain without a second binding to keep in sync.
    publicUrl: `${new URL(c.req.url).origin}/media/${bucket}/${path}`,
  });
});

// ── delete your own object ──────────────────────────────────────────────────
app.delete('/object', async (c) => {
  const bucket = c.req.query('bucket');
  const path = c.req.query('path');
  const userId = c.get('user_id');

  if (!bucket || !path) return c.json({ error: 'Missing bucket or path' }, 400);
  if (!ALLOWED_BUCKETS.includes(bucket as BucketName)) {
    return c.json({ error: 'Invalid bucket' }, 400);
  }
  if (!path.startsWith(`${userId}/`) || path.includes('..')) {
    return c.json({ error: 'You can only delete objects in your own directory.' }, 403);
  }

  await bucketBinding(c.env, bucket as BucketName).delete(path);
  return c.json({ ok: true });
});

// ── DM media, gated on conversation membership ──────────────────────────────
// Keys are `${senderId}/${conversationId}/${timestamp}.ext` — three segments.
// This route matched `:userId/:filename` and rejected a filename containing a
// slash, so it could never match a real key. `{.+}` spans the remainder.
app.get('/dm-media/:userId/:key{.+}', async (c) => {
  const currentUserId = c.get('user_id');
  const pathUserId = c.req.param('userId');
  const filename = c.req.param('key');

  // Traversal is still refused; only the segment count changed.
  if (filename.includes('..')) {
    return c.text('Bad Request', 400);
  }

  // Authorization is delegated to Postgres RLS rather than reimplemented here.
  // `dm_conversation_members` is SELECT-able only for conversations the caller
  // belongs to, so asking — with the CALLER's own token — whether the owner is
  // a member of anything visible answers "do we share a conversation?".
  if (currentUserId !== pathUserId) {
    const token = c.get('access_token');
    const base = c.env.SUPABASE_URL;
    const headers = { Authorization: `Bearer ${token}`, apikey: c.env.SUPABASE_ANON_KEY };

    let shared = false;
    try {
      // Group conversations.
      const memberRes = await fetch(
        `${base}/rest/v1/dm_conversation_members?user_id=eq.${pathUserId}&select=conversation_id&limit=1`,
        { headers },
      );
      shared = memberRes.ok && ((await memberRes.json<unknown[]>())?.length ?? 0) > 0;

      // One-to-one conversations, which predate the members table.
      if (!shared) {
        const pairRes = await fetch(
          `${base}/rest/v1/dm_conversations?select=id&limit=1&or=` +
            `(and(user_a.eq.${currentUserId},user_b.eq.${pathUserId}),` +
            `and(user_a.eq.${pathUserId},user_b.eq.${currentUserId}))`,
          { headers },
        );
        shared = pairRes.ok && ((await pairRes.json<unknown[]>())?.length ?? 0) > 0;
      }
    } catch {
      return c.text('Forbidden', 403);
    }

    if (!shared) return c.text('Forbidden', 403);
  }

  const object = await c.env.DM_MEDIA_BUCKET.get(`${pathUserId}/${filename}`);
  if (object === null) return c.text('Not Found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Private media must never be cached by a shared cache.
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(object.body, { headers });
});

export default app;
