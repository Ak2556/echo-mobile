// An image URL turned into a data URL, for model requests.
//
// Google's OpenAI-compatible endpoint (the first provider in _shared/aiChat)
// takes images as inline base64 data URLs, not as links it fetches itself;
// OpenRouter accepts both. So a caller with a link fetches the bytes here and
// sends them inline, which works on either provider.

/** Larger than any avatar or selfie the app uploads; stops an odd file inflating a request. */
export const MAX_INLINE_IMAGE_BYTES = 7 * 1024 * 1024;

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: spreading a few megabytes into one String.fromCharCode call overflows the stack.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function imageDataUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const declared = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("image is empty");
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) throw new Error(`image too large (${bytes.length} bytes)`);
  // Storage sometimes serves application/octet-stream; JPEG is what the app uploads.
  const type = declared.startsWith("image/") ? declared : "image/jpeg";
  return `data:${type};base64,${bytesToBase64(bytes)}`;
}
