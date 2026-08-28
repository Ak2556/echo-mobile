import { insertRemoteComment, sendRemoteDMToConversation } from '../supabaseEchoApi';
import type { ReplyIntent } from './replyIntent';

/**
 * Performing a reply typed into a notification.
 *
 * Split from `resolveReplyIntent` so the routing rules stay unit-testable; this
 * half is the part that actually touches the network.
 */
export async function performReply(intent: ReplyIntent): Promise<void> {
  if (intent.kind === 'dm') {
    await sendRemoteDMToConversation(intent.conversationId, intent.text);
    return;
  }
  await insertRemoteComment(intent.echoId, intent.text);
}
