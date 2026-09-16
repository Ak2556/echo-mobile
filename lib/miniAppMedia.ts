import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import type { MiniApp } from './miniAppSync';
import { miniAppMediaUrlsEndpoint, uploadUrlEndpoint } from './workerUrl';

const BUCKET = 'mini-app-media';

export interface MiniAppMediaUpload {
  path: string;
  signedUrl: string | null;
}

export async function uploadMiniAppMedia(
  app: MiniApp,
  uri: string,
  input?: { fileName?: string | null; mimeType?: string | null; extension?: string },
): Promise<MiniAppMediaUpload | null> {
  if (!uri || /^https?:\/\//i.test(uri) || !isSupabaseRemote()) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid || !sessionData.session) return null;

  const contentType = normalizeContentType(input?.mimeType, uri, input?.fileName);
  const extension = sanitizeExtension(input?.extension ?? input?.fileName?.split('.').pop() ?? uri.split('?')[0].split('.').pop() ?? contentType.split('/')[1] ?? 'bin');
  const path = `${uid}/${app}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  
  const workerRes = await fetch(uploadUrlEndpoint(BUCKET, path), {
    headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` }
  });
  if (!workerRes.ok) throw new Error('Could not create upload URL');
  const { signedUrl } = await workerRes.json();

  const result = await FileSystem.uploadAsync(signedUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'cache-control': 'max-age=31536000',
      'content-type': contentType,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(result.body || `Media upload failed (${result.status})`);
  }

  // The worker no longer serves this bucket publicly, so there is no stable URL
  // to hand back. Callers keep `path` and ask getMiniAppMediaUrl when they need
  // to show it.
  return { path, signedUrl: null };
}

/**
 * Signed URLs are reused until they are close to expiring. That keeps the
 * image cache warm (it keys on the URL) and saves a round trip per render.
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const REUSE_MARGIN_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;

/**
 * Short-lived URLs for the caller's own mini-app media, keyed by path. A path
 * the worker declines, or anything asked for while offline, is simply absent,
 * and the caller falls back to its local copy.
 */
export async function getMiniAppMediaUrls(
  paths: readonly (string | null | undefined)[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const wanted = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (wanted.length === 0 || !isSupabaseRemote()) return out;

  const now = Date.now();
  const missing: string[] = [];
  for (const path of wanted) {
    const hit = signedUrlCache.get(path);
    if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) out[path] = hit.url;
    else missing.push(path);
  }
  if (missing.length === 0) return out;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return out;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(miniAppMediaUrlsEndpoint(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: batch, expiresIn }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { urls?: Record<string, unknown>; expiresIn?: unknown };
      const ttlSeconds = typeof body.expiresIn === 'number' ? body.expiresIn : expiresIn;
      const expiresAt = Date.now() + ttlSeconds * 1000;
      for (const [path, url] of Object.entries(body.urls ?? {})) {
        if (typeof url !== 'string' || !batch.includes(path)) continue;
        out[path] = url;
        signedUrlCache.set(path, { url, expiresAt });
      }
    } catch {
      // Offline or the worker is unreachable: leave these out.
    }
  }
  return out;
}

export async function getMiniAppMediaUrl(path?: string | null, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  return (await getMiniAppMediaUrls([path], expiresIn))[path] ?? null;
}

/** Test seam: forget every cached URL. */
export function clearMiniAppMediaUrlCache(): void {
  signedUrlCache.clear();
}

function normalizeContentType(input: string | null | undefined, uri: string, fileName?: string | null): string {
  const explicit = input?.toLowerCase();
  if (explicit) return explicit === 'image/jpg' ? 'image/jpeg' : explicit;
  const ext = (fileName ?? uri).split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  if (ext === 'mov' || ext === 'qt') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  return 'image/jpeg';
}

function sanitizeExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(/^x-/, '').replace(/[^a-z0-9]/g, '');
  if (normalized === 'jpeg') return 'jpg';
  if (normalized === 'quicktime') return 'mov';
  return normalized || 'bin';
}
