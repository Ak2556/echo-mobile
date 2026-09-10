import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { authLock } from './authLock';
import { secureSessionStorage } from './secureSessionStorage';

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
    storage: Platform.OS === 'web' ? webStorage : secureSessionStorage,
    // PKCE, not the library default of 'implicit'.
    //
    // Under the implicit flow the provider hands back the access AND refresh
    // tokens in the redirect fragment — here, a deep link to echo://auth/callback.
    // A custom scheme is not owned: any app on the device can register echo://,
    // and one that wins that race walks away with a refresh token, which is
    // account takeover that survives a password change.
    //
    // PKCE returns a single-use code instead, worthless without the verifier
    // held in this app's own storage. lib/auth/callback.ts already called
    // exchangeCodeForSession — the flow was written for PKCE and only the
    // configuration was missing.
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    lock: authLock,
    lockAcquireTimeout: 3_000,
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
