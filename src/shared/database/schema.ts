import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'users',
      columns: [
        { name: 'display_name', type: 'string' },
        { name: 'handle', type: 'string' },
        { name: 'avatar_url', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'thread_id', type: 'string', isIndexed: true },
        { name: 'sender_id', type: 'string', isIndexed: true },
        { name: 'content', type: 'string' },
        { name: 'created_at', type: 'number' },
      ]
    })
  ]
})
