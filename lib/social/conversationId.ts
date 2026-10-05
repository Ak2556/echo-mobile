/**
 * Whether an id is a real conversation row's id.
 *
 * A chat screen opened for a conversation already has its id, so sending needs no
 * get-or-create call to find it (that call looks the conversation up or creates
 * it; it enforces nothing about who may message whom: blocks are refused when the
 * message row is inserted). Only a chat that does not exist yet has to take the
 * recipient path.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isConversationId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID.test(id);
}
