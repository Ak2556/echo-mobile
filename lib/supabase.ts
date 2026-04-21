import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// In-memory storage shim — Expo Go compatible (no NitroModules).
// Replace with react-native-mmkv after expo prebuild / bare workflow.
const _map = new Map<string, string>();
const mmkvStorage = {
  getItem: (key: string): string | null => _map.get(key) ?? null,
  setItem: (key: string, value: string): void => { _map.set(key, value); },
  removeItem: (key: string): void => { _map.delete(key); },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: mmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
