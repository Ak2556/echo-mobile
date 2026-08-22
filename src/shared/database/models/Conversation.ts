import { Model } from '@nozbe/watermelondb';
import { field, date, text } from '@nozbe/watermelondb/decorators';

export default class Conversation extends Model {
  static table = 'dm_conversations';

  @text('other_user_id') otherUserId?: string;
  @text('other_username') otherUsername?: string;
  @text('other_display_name') otherDisplayName?: string;
  @text('other_avatar_color') otherAvatarColor?: string;
  @text('other_avatar_url') otherAvatarUrl?: string;
  @text('other_last_seen_at') otherLastSeenAt?: string;
  @field('is_group') isGroup: boolean;
  @text('group_title') groupTitle?: string;
  @text('group_avatar_color') groupAvatarColor?: string;
  @field('member_count') memberCount: number;
  @date('last_message_at') lastMessageAt?: number;
  @text('last_message_text') lastMessageText?: string;
  @text('last_message_kind') lastMessageKind?: string;
  @field('unread_count') unreadCount: number;
  @field('muted') muted: boolean;
  @field('archived') archived: boolean;
  @field('marked_unread') markedUnread: boolean;
}
