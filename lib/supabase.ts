import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

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
    // CRITICAL: supabase-js v2 deadlocks on React Native without an explicit
    // lock — signInWithPassword / OAuth / signUp hang on the spinner forever.
    // processLock is the supported RN implementation. Web uses the default
    // navigatorLock.
    ...(Platform.OS === 'web' ? {} : { lock: processLock }),
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
