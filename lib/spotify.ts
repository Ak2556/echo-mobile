// Music search, by way of the spotify-search edge function.
//
// The credentials used to live here. They had to be EXPO_PUBLIC_ variables to
// be readable from the app, and Expo inlines those into the bundle at build
// time, so the Spotify client secret shipped inside every build we ever made —
// extractable from an APK with `unzip` and `strings`. Spotify's
// client-credentials grant is a server-side grant; it was never safe here.
//
// The function takes a query and returns the same shape this module always
// returned, so nothing above it had to change.

import { supabase } from './supabase';

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  url: string | null;
  coverArt: string;
}

/**
 * Searches Spotify for tracks matching the query.
 *
 * Throws on failure rather than returning empty, because MusicPickerModal
 * distinguishes "no results" from "search is broken" and shows the message.
 */
export async function searchSpotify(query: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];

  const { data, error } = await supabase.functions.invoke<SpotifyTrack[] | { error?: string }>(
    'spotify-search',
    { body: { query } },
  );

  if (error) {
    throw new Error(error.message || 'Could not reach music search');
  }

  // A non-2xx from the function arrives as an { error } object rather than the
  // array, so shape is what distinguishes success from a handled failure.
  if (!Array.isArray(data)) {
    throw new Error((data && data.error) || 'Music search is unavailable');
  }

  return data;
}
