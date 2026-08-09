async function test() {
  const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  const SPOTIFY_CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET;
  const credentials = require('base-64').encode(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const authRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const authData = await authRes.json();
  const token = authData.access_token;

  const res = await fetch('https://api.spotify.com/v1/search?q=Punjabi&type=track', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Total tracks:', data.tracks?.items?.length);
  const withPreview = (data.tracks?.items || []).filter(t => !!t.preview_url);
  console.log('With preview:', withPreview.length);
  if (withPreview.length === 0 && data.tracks?.items?.length > 0) {
     console.log('First track sample keys:', Object.keys(data.tracks.items[0]));
     console.log('First track preview_url:', data.tracks.items[0].preview_url);
  }
}
test();
