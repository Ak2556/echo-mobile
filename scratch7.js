const key = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

async function test() {
  // Get all follows
  const followsRes = await fetch("https://eyokhisijabitzjiydmz.supabase.co/rest/v1/follows?select=*", {
    headers: { "apikey": key, "Authorization": `Bearer ${key}` }
  });
  const follows = await followsRes.json();
  console.log("Follows count:", follows.length);
  
  if (follows.length > 0) {
    const testUser = follows[0].follower_id;
    console.log("Testing with user:", testUser);
    
    const rpcRes = await fetch("https://eyokhisijabitzjiydmz.supabase.co/rest/v1/rpc/get_ranked_feed", {
      method: "POST",
      headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: testUser, p_limit: 10, p_following_only: true })
    });
    const rpcData = await rpcRes.json();
    console.log("RPC result:", rpcData);
  }
}
test();
