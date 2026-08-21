import { Database } from '@nozbe/watermelondb'
import { Platform } from 'react-native'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'

import schema from './schema'
import User from './models/User'
import Message from './models/Message'

const adapter = Platform.OS === 'web' 
  ? new LokiJSAdapter({
      schema,
      useWebWorker: false,
      useIncrementalIndexedDB: true,
      onSetUpError: error => {
        console.error('LokiJS setup failed', error)
      }
    })
  : new SQLiteAdapter({
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
