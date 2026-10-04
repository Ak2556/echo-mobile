import { Model } from '@nozbe/watermelondb'
import { field, date, text } from '@nozbe/watermelondb/decorators'

export default class User extends Model {
  static table = 'users'

  @text('display_name') displayName: string
  @text('handle') handle: string
  @text('avatar_url') avatarUrl?: string
  @date('created_at') createdAt: Date
}
