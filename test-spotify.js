const btoa = require('base-64').encode;
async function test() {
  const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  const SPOTIFY_CLIENT_SECRET = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET;
  
  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const authRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const authData = await authRes.json();
  const token = authData.access_token;
  console.log('Got token:', !!token);

  const res = await fetch(`https://api.spotify.com/v1/search?q=Top%20Hits&type=track&limit=20`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const text = await res.text();
  console.log('Search response:', res.status, text);
}
test();
