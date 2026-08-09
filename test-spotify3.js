
async function test() {
  const res = await fetch('https://api.spotify.com/v1/search?q=Top%20Hits&type=track&limit=20', {
    headers: { 'Authorization': 'Bearer ' }
  });
  console.log(res.status, await res.text());
}
test();
