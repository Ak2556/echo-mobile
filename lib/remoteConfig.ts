const PLACEHOLDER_HOST = 'placeholder.supabase.co';

/**
 * True when the app should load social data from Supabase (real URL + anon key).
 * Falls back to Zustand + local seed when false so the app runs without a project.
 */
export function isSupabaseRemote(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return false;
  if (url.includes(PLACEHOLDER_HOST)) return false;
  if (key === 'placeholder-key' || key.length < 20) return false;
  try {
    const host = new URL(url).hostname;
    if (!host || host === PLACEHOLDER_HOST) return false;
  } catch {
    return false;
  }
  return true;
}
