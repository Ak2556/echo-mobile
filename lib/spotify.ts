import { encode as btoa } from 'base-64';

// Environment variables must start with EXPO_PUBLIC_ to be available in the client bundle
const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET;

let accessToken: string | null = null;
let tokenExpirationTime = 0;

/**
 * Fetches a client credentials access token from Spotify.
 */
async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpirationTime) {
    return accessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify API keys are missing. Please add EXPO_PUBLIC_SPOTIFY_CLIENT_ID and EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET to your .env file.');
  }

  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify Auth Error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  // Subtract 60 seconds to ensure we refresh before it actually expires
  tokenExpirationTime = Date.now() + (data.expires_in - 60) * 1000;
  
  return accessToken!;
}

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  url: string | null;
  coverArt: string;
}

/**
 * Searches the Spotify API for tracks matching the query.
 * Filters out tracks that do not have a 30-second preview_url.
 */
export async function searchSpotify(query: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  
  const token = await getAccessToken();
  const encodedQuery = encodeURIComponent(query);
  const response = await fetch(`https://api.spotify.com/v1/search?q=${encodedQuery}&type=track`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify Search Error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  return data.tracks.items
    .map((track: any) => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(', '),
      url: track.preview_url || track.external_urls?.spotify || '',
      coverArt: track.album.images[0]?.url || '',
    }));
}
