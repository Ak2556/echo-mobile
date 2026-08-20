const url = "https://eyokhisijabitzjiydmz.supabase.co/rest/v1/profiles?select=id,username,display_name,bio,avatar_color,avatar_url,is_private,dm_privacy,activity_status,online_status,read_receipts,sensitive_content_filter,personalized_notifications&limit=1";
const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

fetch(url, {
  method: "GET",
  headers: { "apikey": key, "Authorization": `Bearer ${key}` }
})
.then(r => r.text())
.then(t => console.log("Response:", t))
.catch(console.error);
