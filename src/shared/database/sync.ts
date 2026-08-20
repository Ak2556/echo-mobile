import { synchronize } from '@nozbe/watermelondb/sync'
import { database } from './index'
import { supabase } from '../../../lib/supabase'

export async function syncDatabase() {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
      // Fetch changes from Supabase
      // This is a stub for the actual pull changes logic
      const timestamp = lastPulledAt ? new Date(lastPulledAt).toISOString() : '1970-01-01T00:00:00.000Z'
      
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .gt('created_at', timestamp)

      const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .gt('updated_at', timestamp)

      return {
        changes: {
          messages: {
            created: messages || [],
            updated: [],
            deleted: [],
          },
          users: {
            created: users || [],
            updated: [],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      }
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      // Push changes to Supabase
      if (changes.messages.created.length > 0) {
        await supabase.from('messages').insert(changes.messages.created)
      }
    },
  })
}
