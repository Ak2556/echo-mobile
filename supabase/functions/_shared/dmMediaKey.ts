// The object key a deleted DM's media_url refers to, if and only if it is safe
// to delete.
//
// media_url is written by the sender's client, so it is a claim, not a fact:
// the read-side pointer injection fixed in 20260926180000 worked by naming
// someone else's file. Deleting on the same claim would let anyone destroy
// another user's media by sending and deleting a message that points at it.
// So a key is returned only when it lies in the sender's own folder, which
// the upload path enforces for every real upload.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const URL_MARKERS = [
  '/storage/v1/object/public/dm-media/', // legacy Supabase Storage, public form
  '/storage/v1/object/sign/dm-media/', // legacy Supabase Storage, signed form
  '/dm-media/', // the media worker's read route
];

function keyFromValue(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    return null;
  }
  for (const marker of URL_MARKERS) {
    const i = path.indexOf(marker);
    if (i >= 0) {
      try {
        return decodeURIComponent(path.slice(i + marker.length));
      } catch {
        return null;
      }
    }
  }
  return null; // some other host or shape: never guess
}

export function dmMediaKey(value: unknown, senderId: unknown): string | null {
  if (typeof value !== 'string' || !value || typeof senderId !== 'string' || !UUID.test(senderId)) return null;
  const key = keyFromValue(value);
  if (!key || key.includes('..') || key.includes('\\')) return null;
  return key.toLowerCase().startsWith(`${senderId.toLowerCase()}/`) && key.length > senderId.length + 1 ? key : null;
}
