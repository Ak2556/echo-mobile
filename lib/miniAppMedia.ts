import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import type { MiniApp } from './miniAppSync';

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
  if (!uid) return null;

  const contentType = normalizeContentType(input?.mimeType, uri, input?.fileName);
  const extension = sanitizeExtension(input?.extension ?? input?.fileName?.split('.').pop() ?? uri.split('?')[0].split('.').pop() ?? contentType.split('/')[1] ?? 'bin');
  const path = `${uid}/${app}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !signed?.signedUrl) throw error ?? new Error('Could not create upload URL');

  const result = await FileSystem.uploadAsync(signed.signedUrl, uri, {
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

  return { path, signedUrl: await getMiniAppMediaUrl(path) };
}

export async function getMiniAppMediaUrl(path?: string | null, expiresIn = 3600): Promise<string | null> {
  if (!path || !isSupabaseRemote()) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
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
