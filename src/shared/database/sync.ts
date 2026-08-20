import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { supabase } from '../../../lib/supabase';
import { encryptMessage, decryptMessage, getUserPublicKey } from '../lib/e2ee';

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

      const decryptedMessages = [];
      
      if (rawMessages && rawMessages.length > 0) {
        // Find the sender public keys
        const userIds = new Set<string>();
        rawMessages.forEach(m => userIds.add(m.sender_id));
        
        const { data: profiles } = await supabase
          .from('users')
          .select('id, public_key')
          .in('id', Array.from(userIds));
          
        const publicKeys = new Map<string, string>();
        profiles?.forEach(p => p.public_key && publicKeys.set(p.id, p.public_key));

        for (const m of rawMessages) {
          let content = m.text;
          
          // E2EE Decryption Attempt
          if (content && content.startsWith('E2EE:')) {
            const senderPubKey = publicKeys.get(m.sender_id);
            if (senderPubKey) {
              const decrypted = await decryptMessage(content.replace('E2EE:', ''), senderPubKey);
              if (decrypted) content = decrypted;
            }
          }

          decryptedMessages.push({
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
            created: decryptedMessages,
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

      if (changes.messages.created.length > 0) {
        // E2EE Encryption for outgoing messages
        const encryptedInserts = [];
        for (const m of changes.messages.created as any[]) {
          // We need the recipient ID to encrypt it.
          // Since we only have thread_id (conversation_id) in the model, we fetch the conversation to find the recipient
          const { data: conv } = await supabase
            .from('dm_conversations')
            .select('user_a, user_b')
            .eq('id', m.thread_id)
            .single();
            
          let finalContent = m.content;
          
          if (conv) {
            const recipientId = conv.user_a === userId ? conv.user_b : conv.user_a;
            const recipientKey = await getUserPublicKey(recipientId);
            
            if (recipientKey) {
              const encrypted = await encryptMessage(m.content, recipientKey);
              finalContent = `E2EE:${encrypted}`;
            }
          }
          
          encryptedInserts.push({
            id: m.id,
            conversation_id: m.thread_id,
            sender_id: m.sender_id,
            text: finalContent,
            kind: 'text',
          });
        }
        
        await supabase.from('direct_messages').insert(encryptedInserts);
      }
    },
  });
}
