import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!);

async function test() {
  const { data: convs, error: err1 } = await supabase.rpc('get_dm_conversations');
  console.log('conversations error:', err1);
  if (convs) {
    console.log(convs.map((c: any) => ({ name: c.other_display_name, unread: c.unread_count })));
  }
}
test();
