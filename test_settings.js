import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://eyokhisijabitzjiydmz.supabase.co";
const SUPABASE_KEY = "sb_publishable_QpEskJHtmFlVVAJXUsBj9Q_nDPl6wP4";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("=== Testing Settings APIs ===");
  // We can't easily sign in as a user without their password,
  // so we'll check if the schema permits selecting these columns via REST.
  
  // We will do a generic public request.
  const { data, error } = await supabase.from('profiles').select('is_private, dm_privacy, sensitive_content_filter').limit(1);
  if (error) {
    console.error("Error reading settings columns:", error);
  } else {
    console.log("Success! Columns exist in the database and are readable:", data);
  }
}

run();
