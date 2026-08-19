const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/profiles?select=id,username,follower_count&order=follower_count.desc&limit=15";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, { headers: { "apikey": key, "Authorization": `Bearer ${key}` } })
  .then(r => r.json())
  .then(data => {
    console.log("Top users by follower_count:");
    console.log(data);
  });
