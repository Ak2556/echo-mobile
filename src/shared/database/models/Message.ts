import { Model } from '@nozbe/watermelondb'
import { field, date, text, relation } from '@nozbe/watermelondb/decorators'
import User from './User'

export default class Message extends Model {
  static table = 'messages'

  @text('thread_id') threadId: string
  @text('content') content: string
  @date('created_at') createdAt: Date
  
  @text('sender_id') senderId: string
  @relation('users', 'sender_id') sender: any
}
