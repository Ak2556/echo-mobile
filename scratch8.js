const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/public_echoes?select=author_id";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, { headers: { "apikey": key, "Authorization": `Bearer ${key}` } })
  .then(r => r.json())
  .then(data => {
    const counts = {};
    for (const row of data) counts[row.author_id] = (counts[row.author_id] || 0) + 1;
    console.log("Echoes per author:", counts);
  });
