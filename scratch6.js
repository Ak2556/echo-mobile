const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/public_echoes?select=id,author_id&limit=100";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, {
  method: "GET",
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`
  }
}).then(r => r.json()).then(data => {
  console.log("Total echoes:", data.length);
}).catch(console.error);
