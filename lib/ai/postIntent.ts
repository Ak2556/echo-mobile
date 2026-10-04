/**
 * Whether a chat message is asking to turn the conversation into a post.
 * A plain question is just a chat: the "Draft ready" banner under the thread
 * appears only after the user has said they want to post, draft or share.
 */
const POST_INTENT = /\b(post|publish|share|draft|compose|echo (this|it|that)|turn (this|it|that) into an? (echo|post))\b/i;

export function wantsToPost(text: string | null | undefined): boolean {
  return !!text && POST_INTENT.test(text);
}
