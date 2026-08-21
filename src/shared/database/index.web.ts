import { Database } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'

import schema from './schema'
import User from './models/User'
import Message from './models/Message'

const adapter = new LokiJSAdapter({
  schema,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onSetUpError: error => {
    console.error('LokiJS setup failed', error)
  }
})

export const database = new Database({
  adapter,
  modelClasses: [
    User,
    Message,
  ],
})
