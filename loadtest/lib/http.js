// Shared HTTP helpers. Header shapes mirror the real client
// (lib/supabase.ts uses apikey + Authorization: Bearer <jwt> on every call).

import { ANON_KEY } from '../config.js';

// PostgREST / RPC calls (rest/v1). `token` is a user JWT, or the anon key for
// unauthenticated read load.
export function restHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Header variant that asks PostgREST to return the inserted row (matches the
// app's `.select().single()` after insert).
export function restWriteHeaders(token) {
  return { ...restHeaders(token), Prefer: 'return=representation' };
}

// Edge Function calls (functions/v1/*).
export function functionHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
}
