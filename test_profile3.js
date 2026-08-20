const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/profiles?select=username,content_language&limit=10";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, {
  method: "GET",
  headers: { "apikey": key, "Authorization": `Bearer ${key}` }
})
.then(r => r.text())
.then(t => console.log("Response:", t))
.catch(console.error);
