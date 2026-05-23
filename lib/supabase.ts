import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Keep the app bootable without a Supabase project. remoteConfig gates real
// remote features off when these placeholders are in use, matching .env.example.
const supabaseUrl = configuredSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = configuredSupabaseAnonKey || 'placeholder-key';

// Expo static rendering runs in Node 20, where Supabase Realtime cannot find a
// native WebSocket. Provide a server-render-only placeholder; real browser and
// native runtimes keep their platform WebSocket implementations.
if (Platform.OS === 'web' && typeof window === 'undefined' && typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class StaticRenderWebSocket {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
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
    // We tried processLock — it deadlocked getSession() under certain
    // post-OAuth conditions, leaving the app stuck on a buffer screen even
    // after sign-in succeeded. The default no-lock behavior is fine for
    // single-threaded JS in React Native.
  },
});

// React Native: pause the token auto-refresher when the app backgrounds.
// supabase-js can't detect AppState transitions on its own — without this it
// keeps a refresh timer alive while the JS thread is suspended, which leads to
// stale tokens and odd resume behavior.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
