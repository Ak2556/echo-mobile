import { Hono } from 'hono';
import { AwsClient } from 'aws4fetch';
import * as jwt from 'hono/jwt';

type Bindings = {
  SUPABASE_JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  AVATARS_BUCKET: R2Bucket;
  ECHO_MEDIA_BUCKET: R2Bucket;
  DM_MEDIA_BUCKET: R2Bucket;
  MINI_APP_MEDIA_BUCKET: R2Bucket;
  MARKETPLACE_PHOTOS_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware to verify Supabase JWT
app.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = await jwt.verify(token, c.env.SUPABASE_JWT_SECRET);
    c.set('user_id', payload.sub);
    await next();
  } catch (e) {
    return c.json({ error: 'Invalid JWT' }, 401);
  }
});

app.get('/upload-url', async (c) => {
  const bucket = c.req.query('bucket');
  const path = c.req.query('path');
  const userId = c.get('user_id');

  if (!bucket || !path) {
    return c.json({ error: 'Missing bucket or path query parameters' }, 400);
  }

  // Enforce RLS: users can only upload to their own directory
  if (!path.startsWith(`${userId}/`)) {
    return c.json({ error: 'Unauthorized path. You can only upload to your own directory.' }, 403);
  }

  const allowedBuckets = ['avatars', 'echo-media', 'dm-media', 'mini-app-media', 'marketplace-photos'];
  if (!allowedBuckets.includes(bucket)) {
    return c.json({ error: 'Invalid bucket' }, 400);
  }

  const r2Client = new AwsClient({
    accessKeyId: c.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
  });

  const url = new URL(
    `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${path}`
  );

  // Generate Presigned URL for PUT
  const signedRequest = await r2Client.sign(
    new Request(url, {
      method: 'PUT',
    }),
    {
      aws_service: 's3',
      aws_region: 'auto',
    }
  );

  // You need to set up a custom domain for R2 in Cloudflare dashboard
  // For now, we will return a generic public URL, but you must configure R2 public access
  // or a custom domain for avatars and echo-media.
  const publicUrl = `https://pub-${c.env.R2_ACCOUNT_ID}.r2.dev/${path}`; // Replace with actual custom domain if set

  return c.json({
    signedUrl: signedRequest.url,
    publicUrl: publicUrl,
  });
});

app.get('/dm-media/:userId/:filename', async (c) => {
  const currentUserId = c.get('user_id');
  const pathUserId = c.req.param('userId');
  const filename = c.req.param('filename');
  const path = `${pathUserId}/${filename}`;

  // For DMs, you'll need your own logic to determine if currentUserId can view pathUserId's media
  // (e.g., query Supabase or check conversation membership).
  // For simplicity here, we assume if they have the link, they can read it (signed URL approach).
  // To truly secure it, implement conversation checks here.

  const object = await c.env.DM_MEDIA_BUCKET.get(path);

  if (object === null) {
    return c.text('Not Found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, {
    headers,
  });
});

export default app;
