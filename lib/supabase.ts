import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// In-memory fallback for private browsing or environments where
// localStorage is disabled/throws (e.g. Safari private mode).
const memStore: Record<string, string> = {};
const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return memStore[key] ?? null;
    try { return window.localStorage.getItem(key); } catch { return memStore[key] ?? null; }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') { memStore[key] = value; return; }
    try { window.localStorage.setItem(key, value); } catch { memStore[key] = value; }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') { delete memStore[key]; return; }
    try { window.localStorage.removeItem(key); } catch { delete memStore[key]; }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
