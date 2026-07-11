import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

// Face verification client. Selfies go to the private `verification` bucket
// (owner-scoped path), then verify-identity judges them against the profile
// photo. See supabase/functions/verify-identity for the decision rules.

export type VerificationStatus = 'approved' | 'pending' | 'rejected';

export interface VerificationState {
  is_verified: boolean;
  request: {
    status: VerificationStatus;
    reject_reason: string | null;
    created_at: string;
    decided_at: string | null;
  } | null;
}

export const POSES = [
  'Look straight at the camera',
  'Turn your head slightly to the left',
  'Turn your head slightly to the right',
  'Smile at the camera',
];

export function randomPose(): string {
  return POSES[Math.floor(Math.random() * POSES.length)];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('verify-identity', { body });
  if (error) {
    // supabase-js wraps non-2xx into FunctionsHttpError with the response attached.
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw new Error(error.message ?? 'Verification service unavailable');
  }
  return data as T;
}

export async function getVerificationState(): Promise<VerificationState> {
  return invoke<VerificationState>({ action: 'status' });
}

export async function submitVerification(selfieUri: string, pose: string): Promise<{ status: VerificationStatus; reason?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const path = `${user.id}/${Date.now()}.jpg`;
  const { data: signed, error: signedErr } = await supabase.storage
    .from('verification')
    .createSignedUploadUrl(path);
  if (signedErr) throw signedErr;

  const result = await FileSystem.uploadAsync(signed.signedUrl, selfieUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'content-type': 'image/jpeg' },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Selfie upload failed (${result.status})`);
  }

  return invoke({ action: 'submit', selfie_path: path, pose });
}

// ── Moderator ────────────────────────────────────────────────────────────────

export interface VerificationQueueItem {
  id: string;
  user_id: string;
  pose: string;
  created_at: string;
  selfie_url: string | null;
  ai_verdict: {
    live_selfie?: boolean;
    same_person?: boolean;
    pose_matches?: boolean;
    confidence?: number;
    reason?: string;
  } | null;
  profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
}

export async function listVerificationQueue(): Promise<VerificationQueueItem[]> {
  const { requests } = await invoke<{ requests: VerificationQueueItem[] }>({ action: 'list' });
  return requests ?? [];
}

export async function decideVerification(requestId: string, approve: boolean): Promise<void> {
  await invoke({ action: 'decide', request_id: requestId, approve });
}
