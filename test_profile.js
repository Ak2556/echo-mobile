import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://eyokhisijabitzjiydmz.supabase.co";
const SUPABASE_KEY = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, bio, avatar_color, avatar_url, is_private, dm_privacy, activity_status, online_status, read_receipts, sensitive_content_filter, personalized_notifications')
      .limit(1);
  console.log("Data:", data);
  console.log("Error:", error);
}
run();
