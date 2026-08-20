import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

import schema from './schema'
import User from './models/User'
import Message from './models/Message'

const adapter = new SQLiteAdapter({
  schema,
  // (You might want to set up migrations here in the future)
  jsi: false, // fast sync
  onSetUpError: error => {
    console.error('Database setup failed', error)
  }
})

export const database = new Database({
  adapter,
  modelClasses: [
    User,
    Message,
  ],
})
