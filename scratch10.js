const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/rpc/get_ranked_feed";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, {
  method: "POST",
  headers: { "apikey": key, "Authorization": `Bearer ${key}` }
}).then(r => r.json()).then(console.log).catch(console.error);
