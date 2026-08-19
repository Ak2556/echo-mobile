const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/rpc/get_ranked_feed";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, {
  method: "POST",
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    p_user_id: null,
    p_limit: 5,
    p_following_only: true
  })
}).then(r => r.json()).then(console.log).catch(console.error);
