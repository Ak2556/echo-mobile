import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

import schema from './schema'
import User from './User'
import Message from './Message'

const adapter = new SQLiteAdapter({
  schema,
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
