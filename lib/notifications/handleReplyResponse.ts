import { router } from 'expo-router';
import { showToast } from '../../components/ui/Toast';
import { persistSet } from '../../store/persist';
import { captureException } from '../monitoring';
import { performReply } from './reply';
import { resolveReplyIntent } from './replyIntent';

/**
 * Handling a reply typed into a notification, once the app is in front.
 *
 * Navigation happens first and the send runs behind it. The user tapped Send in
 * the shade; landing them in the conversation immediately is what that gesture
 * promised, and waiting on a round-trip before the screen changes would read as
 * a hang.
 *
 * A failed send never disappears quietly. For a DM the text goes back into the
 * conversation's draft — the same `chat:draft:<id>` key the thread reads on
 * mount (app/messages/[id].tsx) — so the user arrives with their words still in
 * the composer and one tap from sending them.
 *
 * Returns true when the response was a reply, so the caller skips its normal
 * tap routing.
 */
export function handleNotificationReply(
  actionIdentifier: string,
  userText: string | undefined,
  data: Record<string, unknown> | null | undefined,
): boolean {
  const intent = resolveReplyIntent(actionIdentifier, userText, data);
  if (!intent) return false;

  if (intent.kind === 'dm') {
    router.push({ pathname: '/messages/[id]', params: { id: intent.conversationId } });
  } else {
    router.push({ pathname: '/thread/[id]', params: { id: intent.echoId } });
  }

  performReply(intent)
    .then(() => {
      // The thread will show the message itself; a toast here would duplicate
      // it. Only silence is worth reporting.
    })
    .catch((error) => {
      captureException(error, { tags: { source: 'notification_reply' } });
      if (intent.kind === 'dm') {
        persistSet(`chat:draft:${intent.conversationId}`, intent.text);
        showToast('Could not send — your reply is in the box', 'Error');
      } else {
        showToast('Could not post your reply', 'Error');
      }
    });

  return true;
}
