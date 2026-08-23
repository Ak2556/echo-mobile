// Offline sync for direct messages (WatermelonDB <-> Supabase).
//
// Live: app/_layout.tsx calls useDatabaseSync(), which runs this on mount and
// again whenever the app returns to the foreground.
//
// The client-side encryption that used to live here was removed on 2026-08-23.
// It could never work — it read sender keys from `public.users`, a table no
// migration creates, so the lookup always came back empty and every message
// fell through to plaintext anyway. Echo's chosen model is transport and
// at-rest encryption with server-held keys (see Privacy Policy s14), not
// end-to-end, so the honest thing is to not pretend otherwise here.

import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { supabase } from '../../../lib/supabase';

export async function syncDatabase() {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) return { changes: {}, timestamp: Date.now() };

      // WatermelonDB uses Unix timestamps, Supabase uses ISO strings
      const timestamp = lastPulledAt ? new Date(lastPulledAt).toISOString() : '1970-01-01T00:00:00.000Z';
      
      // Pull remote messages that we are involved in
      const { data: rawMessages } = await supabase
        .from('direct_messages')
        .select('*, dm_conversations!inner(user_a, user_b)')
        .gt('created_at', timestamp);

      const pulledMessages = [];

      if (rawMessages && rawMessages.length > 0) {
        for (const m of rawMessages) {
          // Rows written by the old encryption attempt carry an "E2EE:" prefix
          // over ciphertext nobody holds a key for. Show them as unavailable
          // rather than rendering the raw base64 as if it were the message.
          const content = typeof m.text === 'string' && m.text.startsWith('E2EE:')
            ? '[This message can no longer be displayed]'
            : m.text;

          pulledMessages.push({
            id: m.id,
            thread_id: m.conversation_id,
            sender_id: m.sender_id,
            content: content ?? '',
            created_at: new Date(m.created_at).getTime(),
          });
        }
      }

      return {
        changes: {
          messages: {
            created: pulledMessages,
            updated: [],
            deleted: [], // Handling deletions later
          },
          users: { created: [], updated: [], deleted: [] }, // Optional: sync users
        },
        timestamp: Date.now(),
      };
    },
    pushChanges: async ({ changes }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) return;

      if ((changes as any).messages.created.length > 0) {
        // E2EE Encryption for outgoing messages
        const inserts = [];
        for (const m of (changes as any).messages.created as any[]) {
          // We need the recipient ID to encrypt it.
          // Since we only have thread_id (conversation_id) in the model, we fetch the conversation to find the recipient
          inserts.push({
            id: m.id,
            conversation_id: m.thread_id,
            sender_id: m.sender_id,
            text: m.content,
            kind: 'text',
          });
        }

        const { error } = await supabase.from('direct_messages').insert(inserts);
        // Surface the failure instead of swallowing it: a silent loss here
        // means a message the user watched send never actually left the device.
        if (error) throw error;
      }
    },
  });
}
